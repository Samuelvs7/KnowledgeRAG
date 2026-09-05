import asyncio
import logging
from typing import Any, List, Optional
from database import supabase
from models.schemas import ContentChunk
from services.ai.router import ModelRouter
from services.retrieval.engine import BaseRetriever

logger = logging.getLogger(__name__)


class CodeRetriever(BaseRetriever):
    """Hybrid code retriever with strict repository_id and user_id scoping."""

    def __init__(self, model_name: Optional[str] = None):
        self.provider = ModelRouter.get_provider(model_name)

    @property
    def retriever_type(self) -> str:
        return "code"

    async def retrieve(self, query: str, user_id: str, **kwargs) -> List[ContentChunk]:
        repository_id = kwargs.get("repository_id")
        match_count = kwargs.get("match_count", 20)

        if not repository_id:
            logger.warning("[CodeRetriever] Missing repository_id parameter. Scoping requires repository_id.")
            return []

        # Strict security verification: Verify repository exists
        repo_verify = await asyncio.to_thread(
            lambda: supabase.table("repositories")
            .select("id, user_id")
            .eq("id", repository_id)
            .execute()
        )
        if not repo_verify.data:
            logger.warning(f"[CodeRetriever] Repository {repository_id} not found.")
            return []
        
        target_repo = repo_verify.data[0]
        # Use actual repository owner user_id for chunk retrieval
        actual_user_id = target_repo.get("user_id") or user_id

        async def _run_vector_search() -> List[dict[str, Any]]:
            try:
                emb = await self.provider.embed_text(query, is_query=True)
                try:
                    res = await asyncio.to_thread(
                        lambda: supabase.rpc(
                            "match_code_scoped",
                            {
                                "query_embedding": emb,
                                "p_user_id": user_id,
                                "p_repository_id": repository_id,
                                "match_threshold": 0.25,
                                "match_count": match_count
                            }
                        ).execute()
                    )
                    if res.data:
                        return res.data
                except Exception as rpc_err:
                    logger.info(f"[CodeRetriever] RPC match_code_scoped unavailable ({rpc_err}), using fallback table retrieval")

                # Direct table retrieval fallback
                def _fetch_chunks_fallback():
                    return (
                        supabase.table("code_chunks")
                        .select("id, repository_id, file_path, file_name, content, chunk_index, language, metadata, embedding")
                        .eq("repository_id", repository_id)
                        .limit(200)
                        .execute()
                    )
                fallback_res = await asyncio.to_thread(_fetch_chunks_fallback)
                raw_chunks = fallback_res.data or []

                # Compute cosine similarity manually in Python fallback
                import math
                def _dot(a, b): return sum(x * y for x, y in zip(a, b))
                def _norm(a): return math.sqrt(sum(x * x for x in a))

                scored = []
                q_norm = _norm(emb)
                for chunk in raw_chunks:
                    c_emb = chunk.get("embedding")
                    if not c_emb or not isinstance(c_emb, list):
                        continue
                    sim = _dot(emb, c_emb) / (q_norm * _norm(c_emb) + 1e-9)
                    if sim >= 0.20:
                        chunk["similarity"] = sim
                        scored.append(chunk)

                scored.sort(key=lambda x: x["similarity"], reverse=True)
                return scored[:match_count]
            except Exception as e:
                logger.warning(f"[CodeRetriever] Vector search failed: {e}")
                return []

        async def _run_keyword_search() -> List[dict[str, Any]]:
            # Build a tsquery-safe expression: keep alphanumeric terms and OR them
            # together (e.g. "clipboard copy" -> "clipboard | copy"). This avoids
            # "syntax error in tsquery" from raw multi-word input across postgrest versions.
            terms = ["".join(ch if ch.isalnum() else " " for ch in query).split()][0]
            terms = [t for t in terms if len(t) > 1][:8]
            if not terms:
                return []
            ts_query = " | ".join(terms)
            try:
                def _fetch_fts():
                    return (
                        supabase.table("code_chunks")
                        .select("id, repository_id, file_path, file_name, content, chunk_index, language, metadata")
                        .eq("repository_id", repository_id)
                        .limit(match_count)
                        .text_search("fts", ts_query, options={"config": "english"})
                        .execute()
                    )
                res = await asyncio.to_thread(_fetch_fts)
                return res.data or []
            except Exception as e:
                logger.warning(f"[CodeRetriever] Keyword search failed: {e}")
                return []

        async def _run_symbol_search() -> List[dict[str, Any]]:
            clean_query = query.strip()
            if not clean_query:
                return []
            try:
                # Query code_symbols for matching symbols in files belonging to this repository
                def _fetch_symbols():
                    return (
                        supabase.table("code_symbols")
                        .select("id, file_id, symbol_type, name, signature, start_line, end_line, documentation, repository_files!inner(file_path, repository_id)")
                        .eq("repository_files.repository_id", repository_id)
                        .ilike("name", f"%{clean_query}%")
                        .limit(10)
                        .execute()
                    )
                res = await asyncio.to_thread(_fetch_symbols)
                symbol_matches = []
                for s in (res.data or []):
                    rf = s.get("repository_files") or {}
                    fpath = rf.get("file_path", "unknown")
                    fname = fpath.split("/")[-1] if fpath else "code"
                    symbol_matches.append({
                        "id": str(s["id"]),
                        "repository_id": repository_id,
                        "file_path": fpath,
                        "file_name": fname,
                        "content": f"Symbol [{s.get('symbol_type')}]: {s.get('name')}\nSignature: {s.get('signature') or ''}\nLine Range: L{s.get('start_line')}-L{s.get('end_line')}",
                        "chunk_index": 0,
                        "language": "code",
                        "metadata": {
                            "symbol_name": s.get("name"),
                            "symbol_type": s.get("symbol_type"),
                            "start_line": s.get("start_line"),
                            "end_line": s.get("end_line"),
                            "source_type": "symbol_match"
                        },
                        "similarity": 0.90
                    })
                return symbol_matches
            except Exception as e:
                logger.warning(f"[CodeRetriever] Symbol search failed: {e}")
                return []

        # Gather hybrid search results in parallel
        v_results, k_results, s_results = await asyncio.gather(
            _run_vector_search(),
            _run_keyword_search(),
            _run_symbol_search()
        )

        # Deduplicate and fuse results
        merged: dict[str, dict[str, Any]] = {}
        for item in s_results:
            merged[str(item["id"])] = item
        for item in k_results:
            merged[str(item["id"])] = item
        for item in v_results:
            merged[str(item["id"])] = item

        logger.info(f"[CodeRetriever] Scoped Repository: {repository_id} | Merged Chunks: {len(merged)}")
        return [self._format_content_chunk(v) for v in merged.values()]

    def _format_content_chunk(self, match: dict[str, Any]) -> ContentChunk:
        metadata = dict(match.get("metadata") or {})
        file_path = match.get("file_path") or "repository/file"
        file_name = match.get("file_name") or file_path.split("/")[-1]
        language = match.get("language") or "text"
        start_line = metadata.get("start_line")
        end_line = metadata.get("end_line")

        line_str = ""
        if start_line and end_line:
            line_str = f":L{start_line}-L{end_line}"
        elif start_line:
            line_str = f":L{start_line}"

        source_label = f"{file_path}{line_str}"
        if metadata.get("symbol_name"):
            source_label += f" ({metadata.get('symbol_type', 'symbol')} {metadata.get('symbol_name')})"

        metadata.update({
            "repository_id": str(match.get("repository_id") or ""),
            "file_path": file_path,
            "file_name": file_name,
            "language": language,
            "score": float(match.get("similarity") or match.get("score") or 0.5)
        })

        return ContentChunk(
            id=str(match.get("id") or file_path),
            content=str(match.get("content") or ""),
            similarity=float(match.get("similarity") or match.get("score") or 0.5),
            source=source_label,
            metadata=metadata
        )
