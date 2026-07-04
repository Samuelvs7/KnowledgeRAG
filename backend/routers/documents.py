import asyncio
import json
import logging
import tempfile
import time
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from auth import AuthenticatedUser, get_current_user
from config import settings
from database import supabase
from models.schemas import Diagnostics, DocumentIngestRequest, QueryRequest
from services.chunker import DocumentChunk, iter_document_chunks
from services.text_extractor import extract_metadata, iter_extracted_segments, normalize_file_type
from services.vector_store import finalize_document_chunks, insert_staging_chunks
from services.ai.router import ModelRouter
from services.agents.registry import AgentRegistry
from services.memory import MemoryService


router = APIRouter(prefix="/api/documents", tags=["documents"])
logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"pending", "parsing", "chunking", "embedding", "vectorizing"}
TERMINAL_STATUSES = {"ready", "failed"}
INGESTION_TASKS: dict[str, asyncio.Task[None]] = {}
_INGESTION_SEMAPHORE: asyncio.Semaphore | None = None

def _get_ingestion_semaphore() -> asyncio.Semaphore:
    global _INGESTION_SEMAPHORE
    if _INGESTION_SEMAPHORE is None:
        _INGESTION_SEMAPHORE = asyncio.Semaphore(settings.ingestion_concurrency)
    return _INGESTION_SEMAPHORE

@router.post("/ingest", status_code=status.HTTP_202_ACCEPTED)
async def ingest_document(
    req: DocumentIngestRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    logger.info("[STEP] Upload received")
    logger.info("[STEP] Storage upload complete")
    logger.info("[STEP] Database record created")
    
    logger.info("[UPLOAD] Ingestion request received document_id=%s user_id=%s", req.document_id, user.id)
    document = await asyncio.to_thread(_get_document_for_user, req.document_id, user.id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = _validated_storage_path(document.get("file_url"), user.id)
    existing = await asyncio.to_thread(_get_ingestion_status, req.document_id)
    existing_status = (existing or {}).get("status")

    if existing_status == "ready" and not req.force:
        return {"status": "ready", "document_id": req.document_id}

    if existing_status in ACTIVE_STATUSES and not req.force:
        job_id = str((existing or {}).get("job_id") or uuid.uuid4())
        if not (existing or {}).get("job_id"):
            await asyncio.to_thread(_update_ingestion, req.document_id, "pending", job_id=job_id, progress=0, stage_message="Queued for ingestion")
        _schedule_ingestion(req.document_id, user.id, job_id)
        return {"status": "queued", "document_id": req.document_id, "job_id": job_id}

    job_id = str(uuid.uuid4())
    await asyncio.to_thread(_update_ingestion, req.document_id, "pending", job_id=job_id, progress=0, chunk_count=0, embedding_count=0, error_message=None, stage_message=f"Queued storage object {file_path}", started=True)
    _schedule_ingestion(req.document_id, user.id, job_id)
    return {"status": "queued", "document_id": req.document_id, "job_id": job_id}


@router.post("/query")
async def query_documents(
    req: QueryRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    document_id, collection_id, scope_text = await _resolve_scope(req, user.id)
    
    session_id = getattr(req, 'session_id', None)
    if not session_id:
        session_id = await asyncio.to_thread(MemoryService.create_session, user.id, "document_rag", f"Query: {req.query[:30]}...")
        
    await asyncio.to_thread(MemoryService.add_message, session_id, "user", req.query)
    response_dict = await AgentRegistry.execute("document_rag", req.query, user.id, document_id=document_id, collection_id=collection_id, scope_text=scope_text)
    
    answer = response_dict["answer"]
    diagnostics = response_dict["diagnostics"]
    
    await asyncio.to_thread(MemoryService.add_message, session_id, "assistant", answer, citations=response_dict.get("context_chunks"))
    await asyncio.to_thread(_log_document_query, user.id, req.query.strip(), answer, diagnostics)
    
    return {"answer": answer, "diagnostics": diagnostics, "session_id": session_id}


@router.post("/query/stream")
async def stream_query_documents(
    req: QueryRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    document_id, collection_id, scope_text = await _resolve_scope(req, user.id)
    session_id = getattr(req, 'session_id', None)
    if not session_id:
        session_id = await asyncio.to_thread(MemoryService.create_session, user.id, "document_rag", f"Query: {req.query[:30]}...")
        
    await asyncio.to_thread(MemoryService.add_message, session_id, "user", req.query)

    async def events() -> AsyncIterator[str]:
        try:
            diagnostics, generator, context_chunks = await AgentRegistry.stream("document_rag", req.query, user.id, document_id=document_id, collection_id=collection_id, scope_text=scope_text)
            yield _sse("context", {"diagnostics": _model_dump(diagnostics), "session_id": session_id})
            
            llm_start = time.perf_counter()
            answer_parts = []
            async for delta in generator:
                answer_parts.append(delta)
                yield _sse("delta", {"text": delta})
                
            answer = "".join(answer_parts).strip()
            payload = _model_dump(diagnostics)
            llm_time = int((time.perf_counter() - llm_start) * 1000)
            payload["llmTimeMs"] = llm_time
            payload["totalTimeMs"] = int(payload.get("totalTimeMs") or 0) + llm_time
            final_diagnostics = Diagnostics(**payload)
            
            await asyncio.to_thread(MemoryService.add_message, session_id, "assistant", answer, citations=[c.model_dump() for c in context_chunks])
            await asyncio.to_thread(_log_document_query, user.id, req.query.strip(), answer, final_diagnostics)
            yield _sse("done", {"answer": answer, "diagnostics": _model_dump(final_diagnostics), "session_id": session_id})
            
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Document query stream failed", extra={"user_id": user.id})
            yield _sse("error", {"message": str(exc)})

    return StreamingResponse(events(), media_type="text/event-stream")


async def recover_pending_ingestions() -> None:
    try:
        rows = await asyncio.to_thread(_load_recoverable_ingestions)
    except Exception:
        logger.exception("[FAILED] Could not recover pending document ingestion jobs")
        return

    for row in rows:
        document_id = str(row["document_id"])
        document = await asyncio.to_thread(_get_document_by_id, document_id)
        if not document:
            continue
        job_id = str(row.get("job_id") or uuid.uuid4())
        if not row.get("job_id"):
            await asyncio.to_thread(_update_ingestion, document_id, "pending", job_id=job_id, progress=0, stage_message="Recovered")
        _schedule_ingestion(document_id, str(document["user_id"]), job_id)


def _schedule_ingestion(document_id: str, user_id: str, job_id: str) -> None:
    current = INGESTION_TASKS.get(document_id)
    if current and not current.done():
        return
    task = asyncio.create_task(_run_ingestion(document_id, user_id, job_id))
    INGESTION_TASKS[document_id] = task
    task.add_done_callback(lambda _: INGESTION_TASKS.pop(document_id, None))


async def _run_ingestion(document_id: str, user_id: str, job_id: str) -> None:
    logger.info("[STEP] Background ingestion started")
    overall_start = time.perf_counter()
    async with _get_ingestion_semaphore():
        try:
            document = await asyncio.to_thread(_get_document_for_user, document_id, user_id)
            if not document:
                await asyncio.to_thread(_update_ingestion, document_id, "failed", error_message="Document no longer exists", completed=True)
                return

            file_path = _validated_storage_path(document.get("file_url"), user_id)
            file_type = normalize_file_type(str(document.get("file_type") or ""), file_path)
            title = str(document.get("title") or Path(file_path).name)

            await asyncio.to_thread(_increment_ingestion_attempt, document_id)
            await asyncio.to_thread(_update_ingestion, document_id, "parsing", job_id=job_id, progress=10, stage_message="Reading file", started=True)

            with tempfile.TemporaryDirectory(prefix="knowledgerag-") as temp_dir:
                
                # Reading PDF
                t0 = time.perf_counter()
                logger.info("[STEP] Reading PDF")
                local_path = await _download_storage_object(file_path, temp_dir)
                t1 = time.perf_counter()
                logger.info("[STEP] Reading PDF completed in %.2fs", t1 - t0)

                # Extracting Text / Cleaning
                logger.info("[STEP] Extracting text")
                logger.info("[STEP] Cleaning text")
                metadata = await asyncio.to_thread(extract_metadata, local_path, file_type)
                await asyncio.to_thread(_update_document_metadata, document_id, metadata)
                t2 = time.perf_counter()
                logger.info("[STEP] Extracting text completed in %.2fs", t2 - t1)

                await asyncio.to_thread(_update_ingestion, document_id, "chunking", job_id=job_id, progress=25, stage_message="Extracting text")
                collection_ids = await asyncio.to_thread(_collection_ids_for_document, document_id, user_id)
                
                # Chunking
                logger.info("[STEP] Chunking")
                chunks = await asyncio.to_thread(_build_chunks, local_path, file_type, document_id, title, file_path, collection_ids)
                t3 = time.perf_counter()
                logger.info("[STEP] Chunking completed in %.2fs. Created %d chunks.", t3 - t2, len(chunks))

                if not chunks:
                    await asyncio.to_thread(_update_ingestion, document_id, "failed", job_id=job_id, progress=100, error_message="No text could be extracted", completed=True)
                    return

                await asyncio.to_thread(_update_ingestion, document_id, "embedding", job_id=job_id, progress=45, chunk_count=len(chunks), stage_message=f"Generating embeddings for {len(chunks)} chunks")

                # Embeddings
                logger.info("[STEP] Creating embeddings")
                embeddings: list[list[float]] = []
                try:
                    provider = ModelRouter.get_provider()
                    for i, chunk in enumerate(chunks, 1):
                        e = await provider.embed_text(chunk.content, title=title)
                        embeddings.append(e)
                except Exception as emb_exc:
                    raise RuntimeError(f"Embedding generation failed: {emb_exc}") from emb_exc
                t4 = time.perf_counter()
                logger.info("[STEP] Creating embeddings completed in %.2fs for %d chunks.", t4 - t3, len(embeddings))

                await asyncio.to_thread(_update_ingestion, document_id, "vectorizing", job_id=job_id, progress=80, chunk_count=len(chunks), embedding_count=len(embeddings), stage_message="Saving vector database")

                # Saving vectors
                logger.info("[STEP] Saving vectors")
                inserted_count = await asyncio.to_thread(_replace_document_chunks, job_id, document_id, chunks, embeddings)
                t5 = time.perf_counter()
                logger.info("[STEP] Saving vectors completed in %.2fs.", t5 - t4)

            # Updating status
            logger.info("[STEP] Updating status")
            await asyncio.to_thread(_update_ingestion, document_id, "ready", job_id=job_id, progress=100, chunk_count=inserted_count, embedding_count=inserted_count, stage_message="Document indexed and ready", completed=True)
            logger.info("[STEP] Updating status completed.")
            
            logger.info("[STEP] Finished")
            logger.info("[METRIC] Total ingestion time: %.2fs", time.perf_counter() - overall_start)

        except asyncio.CancelledError:
            await asyncio.to_thread(_update_ingestion, document_id, "pending", job_id=job_id, stage_message="Ingestion interrupted and will be retried on restart")
            raise
        except Exception as exc:
            logger.exception("[FAILED] Document ingestion failed", extra={"document_id": document_id, "job_id": job_id})
            await asyncio.to_thread(_cleanup_staging, document_id, job_id)
            await asyncio.to_thread(_update_ingestion, document_id, "failed", job_id=job_id, progress=100, error_message=str(exc), completed=True)






async def _resolve_scope(req: QueryRequest, user_id: str) -> tuple[str | None, str | None, str]:
    scope = req.scope
    if not scope or scope.mode == "all":
        return None, None, "all indexed documents owned by the authenticated user"

    if scope.mode == "document":
        if not scope.document_id:
            raise HTTPException(status_code=400, detail="Document scope requires document_id")
        document = await asyncio.to_thread(_get_document_for_user, scope.document_id, user_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document scope is not accessible")
        return scope.document_id, None, f"document: {document.get('title') or scope.document_id}"

    if scope.mode == "collection":
        if not scope.collection_id:
            raise HTTPException(status_code=400, detail="Collection scope requires collection_id")
        collection = await asyncio.to_thread(_get_collection_for_user, scope.collection_id, user_id)
        if not collection:
            raise HTTPException(status_code=404, detail="Collection scope is not accessible")
        return None, scope.collection_id, f"collection: {collection.get('name') or scope.collection_id}"

    raise HTTPException(status_code=400, detail=f"Unsupported query scope: {scope.mode}")


async def _download_storage_object(file_path: str, temp_dir: str) -> Path:
    logger.info("[STEP] documents.download_storage_object file_path=%s", file_path)
    logger.info("[START] Creating Supabase Storage signed URL file_path=%s", file_path)
    signed = await asyncio.to_thread(
        lambda: supabase.storage.from_("documents").create_signed_url(file_path, 300)
    )
    signed_url = signed.get("signedURL") or signed.get("signedUrl")
    if not signed_url:
        logger.error("[FAILED] Supabase Storage signed URL missing file_path=%s", file_path)
        raise RuntimeError("Could not create a signed URL for the document")
    logger.info("[SUCCESS] Supabase Storage signed URL created file_path=%s", file_path)

    suffix = Path(file_path).suffix or ".bin"
    local_path = Path(temp_dir) / f"{uuid.uuid4()}{suffix}"
    timeout = httpx.Timeout(
        settings.storage_timeout_seconds,
        connect=10.0,
        read=settings.storage_timeout_seconds,
        write=10.0,
    )
    total = 0
    logger.info("[START] Downloading signed storage URL file_path=%s", file_path)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", signed_url) as response:
            response.raise_for_status()
            content_length = int(response.headers.get("content-length") or 0)
            if content_length > settings.max_document_bytes:
                raise ValueError("Document exceeds the configured file size limit")

            with local_path.open("wb") as handle:
                async for chunk in response.aiter_bytes(1024 * 1024):
                    total += len(chunk)
                    if total > settings.max_document_bytes:
                        raise ValueError("Document exceeds the configured file size limit")
                    handle.write(chunk)
    logger.info("[SUCCESS] Downloaded storage object file_path=%s bytes=%s local_path=%s", file_path, total, local_path)
    return local_path


def _build_chunks(
    local_path: Path,
    file_type: str,
    document_id: str,
    title: str,
    source_path: str,
    collection_ids: list[str],
) -> list[DocumentChunk]:
    logger.info("[STEP] documents.build_chunks document_id=%s file_type=%s", document_id, file_type)
    return list(
        iter_document_chunks(
            iter_extracted_segments(local_path, file_type),
            document_id=document_id,
            title=title,
            source_path=source_path,
            collection_ids=collection_ids,
            chunk_size=500,
            overlap=50,
        )
    )


def _replace_document_chunks(
    job_id: str,
    document_id: str,
    chunks: list[DocumentChunk],
    embeddings: list[list[float]],
) -> int:
    logger.info("[STEP] documents.replace_document_chunks document_id=%s job_id=%s", document_id, job_id)
    if len(chunks) != len(embeddings):
        logger.error(
            "[FAILED] Chunk and embedding counts do not match document_id=%s job_id=%s chunks=%s embeddings=%s",
            document_id,
            job_id,
            len(chunks),
            len(embeddings),
        )
        raise ValueError("Chunk and embedding counts do not match")
    logger.info("[START] Cleaning staging before replacement document_id=%s job_id=%s", document_id, job_id)
    _cleanup_staging(document_id, job_id)
    logger.info("[SUCCESS] Staging cleaned before replacement document_id=%s job_id=%s", document_id, job_id)
    logger.info("[START] Inserting staging chunks document_id=%s job_id=%s", document_id, job_id)
    insert_staging_chunks(job_id, document_id, chunks, embeddings)
    logger.info("[SUCCESS] Staging chunks inserted document_id=%s job_id=%s", document_id, job_id)
    logger.info("[FINALIZE] Calling finalize_document_chunks RPC document_id=%s job_id=%s", document_id, job_id)
    logger.info("[START] Finalizing document chunks document_id=%s job_id=%s", document_id, job_id)
    return finalize_document_chunks(document_id, job_id)


def _get_document_for_user(document_id: str, user_id: str) -> dict[str, Any] | None:
    response = (
        supabase.table("documents")
        .select("*")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _get_document_by_id(document_id: str) -> dict[str, Any] | None:
    response = supabase.table("documents").select("*").eq("id", document_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def _get_collection_for_user(collection_id: str, user_id: str) -> dict[str, Any] | None:
    response = (
        supabase.table("document_collections")
        .select("*")
        .eq("id", collection_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def _get_ingestion_status(document_id: str) -> dict[str, Any] | None:
    response = supabase.table("document_ingestion").select("*").eq("document_id", document_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def _load_recoverable_ingestions() -> list[dict[str, Any]]:
    response = supabase.table("document_ingestion").select("*").in_("status", list(ACTIVE_STATUSES)).execute()
    return response.data or []


def _collection_ids_for_document(document_id: str, user_id: str) -> list[str]:
    links = (
        supabase.table("collection_documents")
        .select("collection_id")
        .eq("document_id", document_id)
        .execute()
        .data
        or []
    )
    collection_ids = [str(link["collection_id"]) for link in links if link.get("collection_id")]
    if not collection_ids:
        return []

    collections = (
        supabase.table("document_collections")
        .select("id")
        .eq("user_id", user_id)
        .in_("id", collection_ids)
        .execute()
        .data
        or []
    )
    return [str(collection["id"]) for collection in collections]


def _update_document_metadata(document_id: str, metadata: dict[str, Any]) -> None:
    logger.info("[STEP] documents.update_document_metadata document_id=%s", document_id)
    logger.info("[START] Supabase update documents metadata document_id=%s", document_id)
    try:
        supabase.table("documents").update({
            "metadata": metadata,
            "updated_at": _utc_now(),
        }).eq("id", document_id).execute()
    except Exception:
        logger.exception("[FAILED] Supabase update documents metadata failed document_id=%s", document_id)
        raise
    logger.info("[SUCCESS] Supabase update documents metadata document_id=%s", document_id)


def _update_ingestion(
    document_id: str,
    status_value: str,
    *,
    job_id: str | None = None,
    progress: int | None = None,
    chunk_count: int | None = None,
    embedding_count: int | None = None,
    error_message: str | None = None,
    stage_message: str | None = None,
    started: bool = False,
    completed: bool = False,
) -> None:
    logger.info("[STEP] documents.update_ingestion document_id=%s status=%s", document_id, status_value)
    payload: dict[str, Any] = {
        "document_id": document_id,
        "status": status_value,
        "updated_at": _utc_now(),
    }
    if job_id is not None:
        payload["job_id"] = job_id
    if progress is not None:
        payload["progress"] = progress
    if chunk_count is not None:
        payload["chunk_count"] = chunk_count
    if embedding_count is not None:
        payload["embedding_count"] = embedding_count
    if error_message is not None or status_value != "failed":
        payload["error_message"] = error_message
    if stage_message is not None:
        payload["stage_message"] = stage_message
    if started:
        payload["started_at"] = _utc_now()
        payload["completed_at"] = None
    if completed or status_value in TERMINAL_STATUSES:
        payload["completed_at"] = _utc_now()

    logger.info("[START] Supabase upsert document_ingestion document_id=%s status=%s", document_id, status_value)
    try:
        supabase.table("document_ingestion").upsert(payload, on_conflict="document_id").execute()
    except Exception:
        logger.exception("[FAILED] Supabase upsert document_ingestion failed document_id=%s status=%s", document_id, status_value)
        raise
    logger.info("[SUCCESS] Supabase upsert document_ingestion document_id=%s status=%s", document_id, status_value)


def _increment_ingestion_attempt(document_id: str) -> None:
    logger.info("[STEP] documents.increment_ingestion_attempt document_id=%s", document_id)
    row = _get_ingestion_status(document_id) or {}
    attempt_count = int(row.get("attempt_count") or 0) + 1
    logger.info("[START] Supabase update document_ingestion attempt_count document_id=%s attempt_count=%s", document_id, attempt_count)
    try:
        supabase.table("document_ingestion").update({
            "attempt_count": attempt_count,
            "updated_at": _utc_now(),
        }).eq("document_id", document_id).execute()
    except Exception:
        logger.exception("[FAILED] Supabase update attempt_count failed document_id=%s", document_id)
        raise
    logger.info("[SUCCESS] Supabase update attempt_count document_id=%s attempt_count=%s", document_id, attempt_count)


def _cleanup_staging(document_id: str, job_id: str) -> None:
    logger.info("[STEP] documents.cleanup_staging document_id=%s job_id=%s", document_id, job_id)
    logger.info("[START] Supabase delete document_chunk_staging document_id=%s job_id=%s", document_id, job_id)
    try:
        supabase.table("document_chunk_staging").delete().eq("document_id", document_id).eq("job_id", job_id).execute()
    except Exception:
        logger.warning("[FAILED] Could not clean document chunk staging rows", extra={"document_id": document_id, "job_id": job_id})
        return
    logger.info("[SUCCESS] Supabase delete document_chunk_staging document_id=%s job_id=%s", document_id, job_id)


def _validated_storage_path(file_url: str | None, user_id: str) -> str:
    if not file_url:
        raise HTTPException(status_code=404, detail="Document has no storage path")

    file_path = _storage_path_from_url(file_url).strip("/")
    if not file_path or file_path.startswith("../") or "/../" in f"/{file_path}/":
        raise HTTPException(status_code=400, detail="Invalid document storage path")
    if not file_path.startswith(f"{user_id}/"):
        raise HTTPException(status_code=403, detail="Document storage path does not belong to the authenticated user")
    return file_path


def _storage_path_from_url(file_url: str) -> str:
    if not file_url.startswith("http"):
        return file_url

    parsed = urlparse(file_url)
    path = unquote(parsed.path)
    marker = "/documents/"
    if marker in path:
        return path.split(marker, 1)[1]
    return "/".join(path.strip("/").split("/")[-2:])





def _log_document_query(user_id: str, query: str, answer: str, diagnostics: Diagnostics) -> None:
    payload = _model_dump(diagnostics)
    try:
        supabase.table("ai_queries").insert({
            "user_id": user_id,
            "query_type": "document",
            "query_text": query,
            "context_chunks": payload["contextChunks"],
            "tool_calls": payload["toolCalls"],
            "embedding_generated": payload["embeddingGenerated"],
            "vector_search_performed": payload["vectorSearchPerformed"],
            "reranker_used": payload["rerankerUsed"],
            "llm_response": answer,
            "response_time_ms": payload["totalTimeMs"],
            "confidence_score": _confidence_from_chunks(payload["contextChunks"]),
            "status": "completed",
        }).execute()
    except Exception:
        logger.warning("Could not log document query", extra={"user_id": user_id})


def _confidence_from_chunks(chunks: list[dict[str, Any]]) -> float:
    if not chunks:
        return 0.0
    average = sum(float(chunk.get("similarity", 0)) for chunk in chunks) / len(chunks)
    return round(max(0.0, min(0.99, average)), 2)


def _model_dump(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if hasattr(model, "dict"):
        return model.dict()
    return dict(model)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
