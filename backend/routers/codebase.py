import os
import uuid
import json
import logging
import tempfile
import asyncio
from typing import Any, Optional, Dict, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, Header, Query as APIQuery
from fastapi.responses import StreamingResponse

from database import supabase
from models.schemas import (
    CodebaseIngestRequest,
    CodebaseQueryRequest,
    CodebaseUrlIngestRequest,
    CodeSearchRequest,
    ExplainFileRequest,
    ExplainFolderRequest,
    ExplainSymbolRequest,
)
from services.code_parser import CodeParserService
from services.agents.registry import AgentRegistry
from services.agents.code_agent import CodeAgent
from services.ai.router import ModelRouter
from services.memory import MemoryService
from services.github_fetcher import GitHubFetchError, fetch_repo_zip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/codebase", tags=["codebase"])


def get_authenticated_user_id(x_user_id: Optional[str] = Header(None)) -> str:
    """Extract authenticated user_id from headers or default to demo user."""
    return x_user_id or "00000000-0000-0000-0000-000000000000"


@router.post("/ingest")
async def ingest_repository(request: CodebaseIngestRequest, background_tasks: BackgroundTasks, x_user_id: Optional[str] = Header(None)):
    """Trigger background repository ingestion pipeline."""
    user_id = request.user_id or get_authenticated_user_id(x_user_id)
    repo_id = request.repository_id

    # Verify repository ownership
    repo_res = supabase.table("repositories").select("*").eq("id", repo_id).eq("user_id", user_id).execute()
    if not repo_res.data:
        raise HTTPException(status_code=404, detail="Repository not found or access denied.")

    # Check if ingestion record exists
    ingest_res = supabase.table("repository_ingestion").select("*").eq("repository_id", repo_id).execute()
    if not ingest_res.data:
        supabase.table("repository_ingestion").insert({
            "repository_id": repo_id,
            "status": "pending",
            "progress": 5,
            "stage_message": "Ingestion job queued"
        }).execute()
    else:
        current_status = ingest_res.data[0].get("status")
        if current_status in ("parsing", "chunking", "embedding", "vectorizing") and not request.force:
            return {"status": "in_progress", "repository_id": repo_id}

    # Queue background task
    background_tasks.add_task(process_repository_ingestion, repo_id, user_id)
    return {"status": "queued", "repository_id": repo_id}


@router.post("/ingest-url")
async def ingest_repository_from_url(
    request: CodebaseUrlIngestRequest,
    background_tasks: BackgroundTasks,
    x_user_id: Optional[str] = Header(None),
):
    """Import a repository directly from a GitHub URL, then run the standard ingestion pipeline."""
    user_id = request.user_id or get_authenticated_user_id(x_user_id)

    try:
        archive = await fetch_repo_zip(request.url, branch=request.branch, token=request.token)
    except GitHubFetchError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("[INGEST-URL] Failed to download repository archive")
        raise HTTPException(status_code=502, detail="Failed to download the repository from GitHub. Please try again.")

    repo_name = f"{archive.owner}/{archive.repo}"
    repo_insert = supabase.table("repositories").insert({
        "user_id": user_id,
        "name": repo_name,
        "description": f"Imported from {archive.source_url} (branch {archive.branch})",
        "source_type": "github",
        "source_url": archive.source_url,
        "default_branch": archive.branch,
    }).execute()
    if not repo_insert.data:
        raise HTTPException(status_code=500, detail="Failed to create repository record.")
    repo_id = repo_insert.data[0]["id"]

    # Write the archive to a temp file for the ingestion pipeline to consume.
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_zip.write(archive.content)
    temp_zip.close()

    # Best-effort: stash the archive in storage so future re-indexing has a source.
    try:
        supabase.storage.from_("repositories").upload(
            f"{user_id}/{repo_id}.zip",
            archive.content,
            {"content-type": "application/zip", "upsert": "true"},
        )
    except Exception as e:
        logger.info(f"[INGEST-URL] Storage stash skipped: {e}")

    supabase.table("repository_ingestion").upsert({
        "repository_id": repo_id,
        "status": "pending",
        "progress": 5,
        "stage_message": f"Import queued for {repo_name}",
    }, on_conflict="repository_id").execute()

    background_tasks.add_task(process_repository_ingestion, repo_id, user_id, temp_zip.name)
    return {
        "status": "queued",
        "repository_id": repo_id,
        "repository_name": repo_name,
        "branch": archive.branch,
    }


async def process_repository_ingestion(repo_id: str, user_id: str, local_zip_path: Optional[str] = None):
    """Core background ingestion task for extracting, parsing, chunking, and embedding a repository.

    When ``local_zip_path`` is provided (e.g. a freshly downloaded GitHub archive), it is used
    directly and cleaned up afterwards; otherwise the archive is downloaded from Supabase Storage.
    """
    job_id = str(uuid.uuid4())
    logger.info(f"[INGEST] Starting ingestion job {job_id} for repo {repo_id}")

    def _update_status(status: str, progress: int, stage_message: str, error_message: Optional[str] = None):
        try:
            supabase.table("repository_ingestion").upsert({
                "repository_id": repo_id,
                "status": status,
                "progress": progress,
                "stage_message": stage_message,
                "error_message": error_message
            }, on_conflict="repository_id").execute()
        except Exception as err:
            logger.info(f"[INGEST] Status update notice: {err}")

    temp_zip_path: Optional[str] = None
    try:
        _update_status("extracting", 10, "Preparing repository archive...")

        if local_zip_path and os.path.exists(local_zip_path):
            # URL import path: archive was already downloaded to disk for us.
            temp_zip_path = local_zip_path
            logger.info(f"[INGEST] Using provided local archive: {local_zip_path}")
        else:
            # Download zip archive from Supabase Storage
            temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
            temp_zip_path = temp_zip.name
            temp_zip.close()

            storage_path = f"{user_id}/{repo_id}.zip"
            downloaded = False
            try:
                zip_bytes = supabase.storage.from_("repositories").download(storage_path)
                with open(temp_zip_path, "wb") as f:
                    f.write(zip_bytes)
                downloaded = True
            except Exception:
                try:
                    zip_bytes = supabase.storage.from_("repositories").download(f"{repo_id}.zip")
                    with open(temp_zip_path, "wb") as f:
                        f.write(zip_bytes)
                    downloaded = True
                except Exception:
                    downloaded = False

            if not downloaded:
                _update_status("failed", 0, "Failed to locate or download repository ZIP archive.")
                return

        _update_status("parsing", 30, "Parsing files, building AST, and extracting symbols...")
        analysis = await asyncio.to_thread(CodeParserService.process_zip, temp_zip_path, repo_id)

        # Cleanup temp file
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)

        _update_status("chunking", 50, f"Generated {len(analysis.all_chunks)} semantic code chunks across {analysis.total_files} files...")

        # Clean existing files and symbols for full re-index
        supabase.table("repository_files").delete().eq("repository_id", repo_id).execute()

        # Batch insert repository_files
        file_id_map: Dict[str, str] = {}
        file_records = []
        for pf in analysis.files:
            file_records.append({
                "repository_id": repo_id,
                "file_path": pf.file_path,
                "file_name": pf.file_name,
                "language": pf.language,
                "line_count": pf.line_count,
                "function_count": len([s for s in pf.symbols if s.symbol_type == "function"]),
                "class_count": len([s for s in pf.symbols if s.symbol_type == "class"]),
                "is_indexed": True,
                # Persist source + parse metadata so file viewing and "explain this file" work.
                "content": pf.content if pf.content_stored else None,
                "content_hash": pf.content_hash,
                "content_stored": pf.content_stored,
                "file_size": pf.file_size,
                "is_binary": pf.is_binary,
                "imports_json": pf.imports,
            })

        # Insert files in batches of 100
        for i in range(0, len(file_records), 100):
            batch = file_records[i:i + 100]
            inserted = supabase.table("repository_files").insert(batch).execute()
            for row in (inserted.data or []):
                file_id_map[row["file_path"]] = row["id"]

        # Insert symbols
        symbol_records = []
        for sym in analysis.all_symbols:
            fid = file_id_map.get(sym.file_path)
            if fid:
                symbol_records.append({
                    "file_id": fid,
                    "symbol_type": sym.symbol_type,
                    "name": sym.name,
                    "signature": sym.signature,
                    "start_line": sym.start_line,
                    "end_line": sym.end_line,
                    "documentation": f"Parsing method: {sym.parsing_method}"
                })

        for i in range(0, len(symbol_records), 200):
            supabase.table("code_symbols").insert(symbol_records[i:i + 200]).execute()

        _update_status("embedding", 75, "Generating code vector embeddings...")
        from services.embeddings import embed_texts

        # Stage code chunks with embeddings
        staged_chunks = []
        batch_texts = []
        batch_metas = []

        for chunk in analysis.all_chunks:
            chunk_text = f"File: {chunk.file_path}\nLanguage: {chunk.language}\n{chunk.content}"
            batch_texts.append(chunk_text)
            batch_metas.append(chunk)

            if len(batch_texts) >= 20:
                embeddings = await embed_texts(batch_texts)
                for c_meta, emb in zip(batch_metas, embeddings):
                    staged_chunks.append({
                        "job_id": job_id,
                        "repository_id": repo_id,
                        "file_path": c_meta.file_path,
                        "file_name": c_meta.file_name,
                        "content": c_meta.content,
                        "embedding": emb,
                        "chunk_index": c_meta.chunk_index,
                        "language": c_meta.language,
                        "metadata": c_meta.metadata
                    })
                batch_texts = []
                batch_metas = []

        if batch_texts:
            embeddings = await embed_texts(batch_texts)
            for c_meta, emb in zip(batch_metas, embeddings):
                staged_chunks.append({
                    "job_id": job_id,
                    "repository_id": repo_id,
                    "file_path": c_meta.file_path,
                    "file_name": c_meta.file_name,
                    "content": c_meta.content,
                    "embedding": emb,
                    "chunk_index": c_meta.chunk_index,
                    "language": c_meta.language,
                    "metadata": c_meta.metadata
                })

        # Insert into staging table or directly into code_chunks fallback
        _update_status("vectorizing", 90, "Writing vectors into database...")
        try:
            for i in range(0, len(staged_chunks), 100):
                supabase.table("code_chunk_staging").insert(staged_chunks[i:i + 100]).execute()
            supabase.rpc("finalize_code_chunks", {"p_repository_id": repo_id, "p_job_id": job_id}).execute()
        except Exception as stage_err:
            logger.info(f"[INGEST] Staging table or RPC unavailable ({stage_err}), inserting directly into code_chunks")
            # Delete old code chunks for this repo
            supabase.table("code_chunks").delete().eq("repository_id", repo_id).execute()
            
            # Map staged_chunks to code_chunks format (without job_id)
            direct_chunks = []
            for sc in staged_chunks:
                direct_chunks.append({
                    "repository_id": sc["repository_id"],
                    "file_path": sc["file_path"],
                    "file_name": sc["file_name"],
                    "content": sc["content"],
                    "embedding": sc["embedding"],
                    "chunk_index": sc["chunk_index"],
                    "language": sc["language"],
                    "metadata": sc["metadata"]
                })
            
            for i in range(0, len(direct_chunks), 50):
                supabase.table("code_chunks").insert(direct_chunks[i:i + 50]).execute()

        # Update repository stats
        supabase.table("repositories").update({
            "file_count": analysis.total_files,
            "description": f"Indexed repository containing {analysis.total_files} files, {analysis.total_lines} lines of code, {analysis.total_functions} functions, {analysis.total_classes} classes."
        }).eq("id", repo_id).execute()

        _update_status("ready", 100, f"Repository ready! Successfully indexed {len(analysis.all_chunks)} chunks.")
        logger.info(f"[INGEST] Ingestion job {job_id} completed successfully for repo {repo_id}")

    except Exception as e:
        logger.exception(f"[INGEST] Failed ingestion for repo {repo_id}")
        _update_status("failed", 0, "Ingestion failed due to an error.", str(e))


@router.get("/ingestion-status/{repo_id}")
async def get_ingestion_status(repo_id: str, x_user_id: Optional[str] = Header(None)):
    """Poll repository indexing progress and status."""
    res = supabase.table("repository_ingestion").select("*").eq("repository_id", repo_id).execute()
    if not res.data:
        return {"status": "not_started", "progress": 0, "stage_message": "Not indexed yet."}
    return res.data[0]


@router.get("/{repo_id}")
async def get_repository_details(repo_id: str, x_user_id: Optional[str] = Header(None)):
    """Get repository details and calculated statistics."""
    user_id = get_authenticated_user_id(x_user_id)
    repo_res = supabase.table("repositories").select("*").eq("id", repo_id).eq("user_id", user_id).execute()
    if not repo_res.data:
        raise HTTPException(status_code=404, detail="Repository not found.")
    repo = repo_res.data[0]

    # Calculate real stats from DB
    files_res = supabase.table("repository_files").select("language, line_count, function_count, class_count").eq("repository_id", repo_id).execute()
    files_data = files_res.data or []

    total_lines = sum(f.get("line_count", 0) for f in files_data)
    total_funcs = sum(f.get("function_count", 0) for f in files_data)
    total_classes = sum(f.get("class_count", 0) for f in files_data)

    lang_breakdown: Dict[str, int] = {}
    for f in files_data:
        l = f.get("language", "unknown")
        lang_breakdown[l] = lang_breakdown.get(l, 0) + 1

    return {
        "repository": repo,
        "stats": {
            "file_count": len(files_data),
            "line_count": total_lines,
            "function_count": total_funcs,
            "class_count": total_classes,
            "language_breakdown": lang_breakdown
        }
    }


@router.get("/{repo_id}/files")
async def list_repository_files(repo_id: str, x_user_id: Optional[str] = Header(None)):
    """List all indexed files for a repository."""
    user_id = get_authenticated_user_id(x_user_id)
    res = supabase.table("repository_files").select("id, file_path, file_name, language, line_count, function_count, class_count, is_indexed, content_stored, file_size").eq("repository_id", repo_id).execute()
    return {"files": res.data or []}


@router.get("/{repo_id}/file-content")
async def get_file_content(repo_id: str, file_path: str = APIQuery(...), x_user_id: Optional[str] = Header(None)):
    """Get raw file source code for a specific repository file."""
    user_id = get_authenticated_user_id(x_user_id)
    res = supabase.table("repository_files").select("id, file_path, file_name, language, content, content_stored, line_count, imports_json").eq("repository_id", repo_id).eq("file_path", file_path).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail=f"File {file_path} not found in repository.")

    file_info = res.data[0]
    # Fetch symbols for this file
    symbols: list = []
    if file_info.get("id"):
        sym_res = supabase.table("code_symbols").select("*").eq("file_id", file_info["id"]).order("start_line").execute()
        symbols = sym_res.data or []

    return {
        "file": file_info,
        "symbols": symbols
    }


@router.get("/{repo_id}/symbols")
async def list_repository_symbols(repo_id: str, symbol_type: Optional[str] = None, search: Optional[str] = None, x_user_id: Optional[str] = Header(None)):
    """Get symbols for a repository with optional filtering."""
    q = supabase.table("code_symbols").select("*, repository_files!inner(file_path, repository_id)").eq("repository_files.repository_id", repo_id)
    if symbol_type:
        q = q.eq("symbol_type", symbol_type)
    if search:
        q = q.ilike("name", f"%{search}%")
    res = q.limit(100).execute()
    return {"symbols": res.data or []}


@router.post("/{repo_id}/search")
async def search_codebase(repo_id: str, request: CodeSearchRequest, x_user_id: Optional[str] = Header(None)):
    """Hybrid search across repository code chunks, symbols, and files."""
    user_id = request.user_id or get_authenticated_user_id(x_user_id)
    retriever = AgentRegistry.get_agent("code").retriever
    chunks = await retriever.retrieve(
        query=request.query,
        user_id=user_id,
        repository_id=repo_id,
        match_count=request.match_count
    )
    return {"results": [c.model_dump() for c in chunks]}


@router.post("/{repo_id}/query")
async def query_codebase(repo_id: str, request: CodebaseQueryRequest, x_user_id: Optional[str] = Header(None)):
    """Execute AI assistant query against repository."""
    user_id = request.user_id or get_authenticated_user_id(x_user_id)
    agent = AgentRegistry.get_agent("code")
    
    # Ensure memory session exists
    session_id = request.session_id
    if not session_id:
        session = MemoryService.create_session(user_id=user_id, module_type="codebase", title=f"Query: {request.query[:30]}")
        session_id = session.get("id") if isinstance(session, dict) else str(session)

    res = await agent.execute(
        query=request.query,
        user_id=user_id,
        repository_id=repo_id,
        mode=request.mode,
        session_id=session_id
    )

    # Save to session memory
    if session_id:
        MemoryService.add_message(session_id, "user", request.query)
        MemoryService.add_message(session_id, "assistant", res["answer"], citations=res.get("context_chunks"))

    res["session_id"] = session_id
    return res


@router.post("/{repo_id}/query/stream")
async def stream_query_codebase(repo_id: str, request: CodebaseQueryRequest, x_user_id: Optional[str] = Header(None)):
    """SSE Streaming query response for AI assistant."""
    user_id = request.user_id or get_authenticated_user_id(x_user_id)
    agent: CodeAgent = AgentRegistry.get_agent("code")  # type: ignore

    session_id = request.session_id
    if not session_id:
        session = MemoryService.create_session(user_id=user_id, module_type="codebase", title=f"Query: {request.query[:30]}")
        session_id = session.get("id") if isinstance(session, dict) else str(session)

    diagnostics, stream_gen, context_chunks = await agent.stream(
        query=request.query,
        user_id=user_id,
        repository_id=repo_id,
        mode=request.mode,
        session_id=session_id
    )

    async def event_generator():
        yield f"event: metadata\ndata: {json.dumps({'diagnostics': diagnostics.model_dump(), 'session_id': session_id, 'context_chunks': [c.model_dump() for c in context_chunks]})}\n\n"
        full_text = ""
        async for chunk in stream_gen:
            full_text += chunk
            yield f"event: delta\ndata: {json.dumps({'text': chunk})}\n\n"

        if session_id:
            MemoryService.add_message(session_id, "user", request.query)
            MemoryService.add_message(session_id, "assistant", full_text, citations=[c.model_dump() for c in context_chunks])

        yield "event: done\ndata: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{repo_id}/architecture")
async def get_repository_architecture(repo_id: str, x_user_id: Optional[str] = Header(None)):
    """Evidence-based architecture analysis of the repository."""
    user_id = get_authenticated_user_id(x_user_id)
    
    # Gather evidence from DB
    files_res = supabase.table("repository_files").select("file_path, language, function_count, class_count, imports_json").eq("repository_id", repo_id).execute()
    files_data = files_res.data or []

    entry_points = [f["file_path"] for f in files_data if f["file_path"].lower() in {
        "main.py", "app.py", "index.ts", "index.js", "main.go", "main.rs", "app.tsx", "server.js", "server.ts",
        "src/main.py", "src/index.ts", "src/app.tsx"
    }]

    lang_dist: Dict[str, int] = {}
    for f in files_data:
        l = f.get("language", "unknown")
        lang_dist[l] = lang_dist.get(l, 0) + 1

    observed_evidence = {
        "total_files": len(files_data),
        "language_distribution": lang_dist,
        "detected_entry_points": entry_points,
        "sample_imports": [f["imports_json"] for f in files_data if f.get("imports_json")][:10]
    }

    # Ask CodeAgent to summarize architecture based strictly on evidence
    agent = AgentRegistry.get_agent("code")
    arch_res = await agent.execute(
        query=f"Provide a structural breakdown of the repository architecture based on the observed evidence: {json.dumps(observed_evidence)}",
        user_id=user_id,
        repository_id=repo_id,
        mode="architecture"
    )

    return {
        "evidence": observed_evidence,
        "explanation": arch_res["answer"],
        "diagnostics": arch_res["diagnostics"]
    }


# ---------------------------------------------------------------------------
# Targeted explanation endpoints (file / folder / symbol)
# ---------------------------------------------------------------------------
EXPLAIN_FILE_MAX_CHARS = 24000


def _file_source(repo_id: str, file_path: str) -> str:
    """Return stored file content, falling back to reassembled chunks for large/old files."""
    res = (
        supabase.table("repository_files")
        .select("content")
        .eq("repository_id", repo_id)
        .eq("file_path", file_path)
        .limit(1)
        .execute()
    )
    content = (res.data[0].get("content") if res.data else None) or ""
    if content:
        return content
    chunk_res = (
        supabase.table("code_chunks")
        .select("content, chunk_index")
        .eq("repository_id", repo_id)
        .eq("file_path", file_path)
        .order("chunk_index")
        .limit(80)
        .execute()
    )
    return "\n\n".join(c["content"] for c in (chunk_res.data or []))


@router.post("/{repo_id}/explain-file")
async def explain_file(repo_id: str, request: ExplainFileRequest, x_user_id: Optional[str] = Header(None)):
    """Explain an entire file grounded in its stored source."""
    user_id = request.user_id or get_authenticated_user_id(x_user_id)
    res = (
        supabase.table("repository_files")
        .select("id, file_path, file_name, language, line_count")
        .eq("repository_id", repo_id)
        .eq("file_path", request.file_path)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=f"File {request.file_path} not found in repository.")
    f = res.data[0]

    symbols = []
    if f.get("id"):
        sym_res = (
            supabase.table("code_symbols")
            .select("symbol_type, name, start_line, end_line")
            .eq("file_id", f["id"])
            .order("start_line")
            .execute()
        )
        symbols = sym_res.data or []

    content = _file_source(repo_id, request.file_path)
    if not content:
        raise HTTPException(status_code=404, detail="No indexed source is available for this file yet.")

    truncated = len(content) > EXPLAIN_FILE_MAX_CHARS
    body = content[:EXPLAIN_FILE_MAX_CHARS]

    outline = ""
    if symbols:
        outline = "\nSymbol outline:\n" + "\n".join(
            f"- {s['symbol_type']} {s['name']} (L{s['start_line']}-L{s['end_line']})" for s in symbols
        )

    context_text = (
        f"File: {f['file_path']} (language: {f.get('language')}, {f.get('line_count')} lines){outline}\n\n"
        f"----- SOURCE{' (truncated)' if truncated else ''} -----\n{body}"
    )
    question = request.question or (
        "Explain what this file does: its overall purpose, the main functions/classes and their "
        "responsibilities, notable logic or algorithms, external dependencies it uses, and how it "
        "likely fits into the wider project."
    )

    agent: CodeAgent = AgentRegistry.get_agent("code")  # type: ignore
    result = await agent.explain(
        target_label=f"file {f['file_path']}",
        context_text=context_text,
        question=question,
        user_id=user_id,
        repository_id=repo_id,
        mode="explain",
        session_id=request.session_id,
    )
    if request.session_id:
        MemoryService.add_message(request.session_id, "user", f"Explain file: {f['file_path']}")
        MemoryService.add_message(request.session_id, "assistant", result["answer"])

    return {
        "answer": result["answer"],
        "diagnostics": result["diagnostics"].model_dump(),
        "target": {"type": "file", "file_path": f["file_path"], "language": f.get("language")},
    }


@router.post("/{repo_id}/explain-symbol")
async def explain_symbol(repo_id: str, request: ExplainSymbolRequest, x_user_id: Optional[str] = Header(None)):
    """Explain a single function/class/interface grounded in its source slice."""
    user_id = request.user_id or get_authenticated_user_id(x_user_id)

    q = (
        supabase.table("code_symbols")
        .select("id, symbol_type, name, signature, start_line, end_line, repository_files!inner(file_path, repository_id, content, language)")
        .eq("repository_files.repository_id", repo_id)
    )
    if request.symbol_id:
        q = q.eq("id", request.symbol_id)
    elif request.symbol_name:
        q = q.eq("name", request.symbol_name)
        if request.file_path:
            q = q.eq("repository_files.file_path", request.file_path)
    else:
        raise HTTPException(status_code=400, detail="Provide symbol_id or symbol_name.")

    res = q.limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Symbol not found.")
    s = res.data[0]
    rf = s.get("repository_files") or {}
    file_path = rf.get("file_path", "unknown")
    start = int(s.get("start_line") or 1)
    end = int(s.get("end_line") or start)

    snippet = ""
    file_content = rf.get("content") or ""
    if file_content:
        lines = file_content.splitlines()
        snippet = "\n".join(lines[max(0, start - 1):min(len(lines), end)])
    if not snippet:
        chunk_res = (
            supabase.table("code_chunks")
            .select("content, metadata")
            .eq("repository_id", repo_id)
            .eq("file_path", file_path)
            .limit(80)
            .execute()
        )
        for c in (chunk_res.data or []):
            if (c.get("metadata") or {}).get("symbol_name") == s.get("name"):
                snippet = c["content"]
                break

    context_text = (
        f"Symbol: {s['symbol_type']} {s['name']}\n"
        f"File: {file_path} (L{start}-L{end})\n"
        f"Signature: {s.get('signature') or ''}\n\n"
        f"----- SOURCE -----\n{snippet or '(source not available)'}"
    )
    question = request.question or (
        f"Explain the {s['symbol_type']} '{s['name']}': its purpose, parameters and return value, "
        "step-by-step behavior, any side effects, and where/why it would be called."
    )

    agent: CodeAgent = AgentRegistry.get_agent("code")  # type: ignore
    result = await agent.explain(
        target_label=f"{s['symbol_type']} {s['name']} in {file_path}",
        context_text=context_text,
        question=question,
        user_id=user_id,
        repository_id=repo_id,
        mode="explain",
        session_id=request.session_id,
    )
    if request.session_id:
        MemoryService.add_message(request.session_id, "user", f"Explain {s['symbol_type']}: {s['name']}")
        MemoryService.add_message(request.session_id, "assistant", result["answer"])

    return {
        "answer": result["answer"],
        "diagnostics": result["diagnostics"].model_dump(),
        "target": {"type": "symbol", "name": s["name"], "symbol_type": s["symbol_type"], "file_path": file_path},
    }


@router.post("/{repo_id}/explain-folder")
async def explain_folder(repo_id: str, request: ExplainFolderRequest, x_user_id: Optional[str] = Header(None)):
    """Explain a folder/module from an evidence outline of its files and symbols."""
    user_id = request.user_id or get_authenticated_user_id(x_user_id)
    folder = (request.folder_path or "").strip().strip("/")

    res = (
        supabase.table("repository_files")
        .select("id, file_path, language, line_count, function_count, class_count")
        .eq("repository_id", repo_id)
        .execute()
    )
    all_files = res.data or []
    files = [
        f for f in all_files
        if not folder or f["file_path"] == folder or f["file_path"].startswith(folder + "/")
    ]
    if not files:
        raise HTTPException(status_code=404, detail=f"No indexed files under '{request.folder_path}'.")

    file_ids = [f["id"] for f in files if f.get("id")][:200]
    symbols_by_file: Dict[str, List[str]] = {}
    if file_ids:
        sym_res = (
            supabase.table("code_symbols")
            .select("file_id, symbol_type, name")
            .in_("file_id", file_ids)
            .limit(500)
            .execute()
        )
        for srow in (sym_res.data or []):
            symbols_by_file.setdefault(srow["file_id"], []).append(f"{srow['symbol_type']} {srow['name']}")

    outline_lines: List[str] = []
    for f in sorted(files, key=lambda x: x["file_path"])[:120]:
        syms = symbols_by_file.get(f.get("id"), [])[:8]
        sym_str = f" — {', '.join(syms)}" if syms else ""
        outline_lines.append(f"- {f['file_path']} [{f.get('language')}, {f.get('line_count')} lines]{sym_str}")

    context_text = (
        f"Folder: {request.folder_path or '(repository root)'}\n"
        f"Files ({len(files)} total, showing up to 120):\n" + "\n".join(outline_lines)
    )
    question = request.question or (
        "Explain the purpose and structure of this folder/module: what responsibility it owns, how its "
        "files relate to each other, the key components, and how it fits into the overall architecture."
    )

    agent: CodeAgent = AgentRegistry.get_agent("code")  # type: ignore
    result = await agent.explain(
        target_label=f"folder {request.folder_path or '(root)'}",
        context_text=context_text,
        question=question,
        user_id=user_id,
        repository_id=repo_id,
        mode="architecture",
        session_id=request.session_id,
    )
    if request.session_id:
        MemoryService.add_message(request.session_id, "user", f"Explain folder: {request.folder_path}")
        MemoryService.add_message(request.session_id, "assistant", result["answer"])

    return {
        "answer": result["answer"],
        "diagnostics": result["diagnostics"].model_dump(),
        "target": {"type": "folder", "folder_path": request.folder_path, "file_count": len(files)},
    }
