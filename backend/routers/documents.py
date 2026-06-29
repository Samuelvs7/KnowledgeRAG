import time
from urllib.parse import urlparse, unquote

from fastapi import APIRouter, HTTPException
from models.schemas import DocumentIngestRequest, QueryRequest, QueryResponse, Diagnostics, ContentChunk
from services.text_extractor import extract_text_from_file
from services.chunker import chunk_text
from services.embeddings import get_embeddings, get_query_embedding
from services.vector_store import insert_document_chunks, search_documents
from database import supabase
import google.generativeai as genai

router = APIRouter(prefix="/api/documents", tags=["documents"])

@router.post("/ingest")
async def ingest_document(req: DocumentIngestRequest):
    """
    Downloads file from Supabase storage, extracts text, chunks it, generates embeddings, 
    and saves to vector database.
    """
    try:
        _update_ingestion(req.document_id, "parsing", started=True)

        # Get document record to find file URL/path
        doc_resp = supabase.table("documents").select("*").eq("id", req.document_id).single().execute()
        document = doc_resp.data
        if not document or not document.get("file_url"):
            raise HTTPException(status_code=404, detail="Document file not found in database")
            
        file_path = _storage_path_from_url(document.get("file_url"))
        res = supabase.storage.from_("documents").download(file_path)
        
        text = extract_text_from_file(res, req.file_type)
        if not text:
            _update_ingestion(req.document_id, "failed", error_message="No text extracted")
            return {"status": "error", "message": "No text extracted"}
            
        _update_ingestion(req.document_id, "chunking")
        chunks = chunk_text(text, chunk_size=500, overlap=50)

        supabase.table("document_chunks").delete().eq("document_id", req.document_id).execute()
        
        _update_ingestion(req.document_id, "embedding", chunk_count=len(chunks))
        batch_size = 100
        embedded_count = 0
        for i in range(0, len(chunks), batch_size):
            chunk_batch = chunks[i:i+batch_size]
            embeddings = get_embeddings(chunk_batch)
            _update_ingestion(req.document_id, "vectorizing", chunk_count=len(chunks), embedding_count=embedded_count + len(embeddings))
            insert_document_chunks(req.document_id, chunk_batch, embeddings)
            embedded_count += len(embeddings)

        _update_ingestion(req.document_id, "ready", chunk_count=len(chunks), embedding_count=embedded_count, completed=True)

        return {"status": "success", "chunks": len(chunks)}
    except Exception as e:
        print(f"Error during ingestion: {e}")
        _update_ingestion(req.document_id, "failed", error_message=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/query", response_model=QueryResponse)
async def query_documents(req: QueryRequest):
    start_time = time.time()
    
    try:
        # 1. Embed query
        embed_start = time.time()
        query_embedding = get_query_embedding(req.query)
        embed_time = int((time.time() - embed_start) * 1000)
        
        search_start = time.time()
        results = search_documents(query_embedding, match_threshold=0.3, match_count=12)
        results = _filter_matches_by_scope(results, req)
        results = results[:4]
        search_time = int((time.time() - search_start) * 1000)
        
        context_chunks = []
        context_text = ""
        for i, match in enumerate(results):
            similarity = match.get("similarity", 0)
            source = match.get("source") or "Extracted from documents"
            context_text += f"\nSnippet {i+1}:\n{match['content']}\n"
            context_chunks.append(ContentChunk(
                id=match['id'],
                content=match['content'],
                similarity=similarity,
                source=source,
                metadata=match.get("metadata") or {}
            ))
            
        rerank_start = time.time()
        # Reranking logic could go here; skipping for Gemini API single-pass
        rerank_time = int((time.time() - rerank_start) * 1000)
        
        # 3. LLM Generation
        llm_start = time.time()
        llm = genai.GenerativeModel('gemini-2.0-flash')
        scope_text = _scope_prompt(req)
        prompt = f"""You are a highly capable AI assistant for the KnowledgeRAG platform.
        Answer the user's question based strictly on the following context snippets.
        If the answer is not contained in the context, say "I could not find the answer in your uploaded documents."
        Scope: {scope_text}
        
        CONTEXT:
        {context_text}
        
        USER QUESTION:
        {req.query}
        """
        response = llm.generate_content(prompt)
        llm_time = int((time.time() - llm_start) * 1000)
        
        # Build Diagnostics
        total_time = int((time.time() - start_time) * 1000)
        diagnostics = Diagnostics(
            embeddingGenerated=True,
            embeddingModel="text-embedding-004",
            embeddingDimensions=768,
            embeddingTimeMs=embed_time,
            vectorSearchPerformed=True,
            vectorSearchResults=len(results),
            vectorSearchTimeMs=search_time,
            rerankerUsed=False,
            rerankerTimeMs=rerank_time,
            llmPromptTokens=getattr(response.usage_metadata, 'prompt_token_count', 0) if hasattr(response, 'usage_metadata') else 0,
            llmCompletionTokens=getattr(response.usage_metadata, 'candidates_token_count', 0) if hasattr(response, 'usage_metadata') else 0,
            llmTimeMs=llm_time,
            totalTimeMs=total_time,
            contextChunks=context_chunks,
            toolCalls=[]
        )

        _log_document_query(req, response.text, diagnostics)
        
        return QueryResponse(answer=response.text, diagnostics=diagnostics)
    except Exception as e:
        print(f"Error querying: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _storage_path_from_url(file_url: str) -> str:
    if not file_url.startswith("http"):
        return file_url

    parsed = urlparse(file_url)
    path = unquote(parsed.path)
    marker = "/documents/"
    if marker in path:
        return path.split(marker, 1)[1]
    return "/".join(path.strip("/").split("/")[-2:])


def _update_ingestion(
    document_id: str,
    status: str,
    *,
    chunk_count: int | None = None,
    embedding_count: int | None = None,
    error_message: str | None = None,
    started: bool = False,
    completed: bool = False,
) -> None:
    payload = {
        "document_id": document_id,
        "status": status,
    }
    if chunk_count is not None:
        payload["chunk_count"] = chunk_count
    if embedding_count is not None:
        payload["embedding_count"] = embedding_count
    if error_message is not None:
        payload["error_message"] = error_message
    if started:
        payload["started_at"] = _utc_now()
    if completed or status in {"ready", "failed"}:
        payload["completed_at"] = _utc_now()

    try:
        supabase.table("document_ingestion").upsert(payload, on_conflict="document_id").execute()
    except Exception as exc:
        print(f"Could not update ingestion status: {exc}")


def _filter_matches_by_scope(matches: list[dict], req: QueryRequest) -> list[dict]:
    if not matches:
        return []

    ids = [match["id"] for match in matches if match.get("id")]
    if not ids:
        return matches

    allowed_document_ids = _allowed_document_ids(req)

    try:
        chunk_resp = supabase.table("document_chunks").select("id,document_id,chunk_index").in_("id", ids).execute()
        chunks = {chunk["id"]: chunk for chunk in (chunk_resp.data or [])}
        doc_ids = list({chunk["document_id"] for chunk in chunks.values()})
        if not doc_ids:
            return []

        doc_resp = supabase.table("documents").select("id,title,user_id").in_("id", doc_ids).execute()
        docs = {doc["id"]: doc for doc in (doc_resp.data or [])}
    except Exception as exc:
        print(f"Could not hydrate document matches: {exc}")
        return matches

    filtered = []
    for match in matches:
        chunk = chunks.get(match.get("id"))
        if not chunk:
            continue
        doc = docs.get(chunk["document_id"])
        if not doc or doc.get("user_id") != req.user_id:
            continue
        if allowed_document_ids is not None and chunk["document_id"] not in allowed_document_ids:
            continue

        enriched = dict(match)
        enriched["source"] = f"{doc.get('title', 'Document')} - chunk {int(chunk.get('chunk_index') or 0) + 1}"
        enriched["metadata"] = {
            "document_id": chunk["document_id"],
            "document_title": doc.get("title"),
            "chunk_index": chunk.get("chunk_index"),
        }
        filtered.append(enriched)

    return filtered


def _allowed_document_ids(req: QueryRequest) -> set[str] | None:
    if not req.scope or req.scope.mode == "all":
        return None

    if req.scope.mode == "document" and req.scope.document_id:
        return {req.scope.document_id}

    if req.scope.mode == "collection" and req.scope.collection_id:
        try:
            response = supabase.table("collection_documents").select("document_id").eq("collection_id", req.scope.collection_id).execute()
            return {row["document_id"] for row in (response.data or [])}
        except Exception as exc:
            print(f"Could not load collection scope: {exc}")
            return set()

    return None


def _scope_prompt(req: QueryRequest) -> str:
    if not req.scope or req.scope.mode == "all":
        return "all indexed documents"
    if req.scope.mode == "document":
        return f"single document {req.scope.document_id or 'not selected'}"
    if req.scope.mode == "collection":
        return f"collection {req.scope.collection_id or 'not selected'}"
    return req.scope.mode


def _log_document_query(req: QueryRequest, answer: str, diagnostics: Diagnostics) -> None:
    payload = diagnostics.model_dump() if hasattr(diagnostics, "model_dump") else diagnostics.dict()
    try:
        supabase.table("ai_queries").insert({
            "user_id": req.user_id,
            "query_type": "document",
            "query_text": req.query,
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
    except Exception as exc:
        print(f"Could not log document query: {exc}")


def _confidence_from_chunks(chunks: list[dict]) -> float:
    if not chunks:
        return 0.0
    average = sum(float(chunk.get("similarity", 0)) for chunk in chunks) / len(chunks)
    return round(max(0.0, min(0.99, average)), 2)


def _utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
