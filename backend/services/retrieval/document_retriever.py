import asyncio
from typing import Any
from database import supabase
from models.schemas import ContentChunk
from services.ai.router import ModelRouter
from services.retrieval.engine import BaseRetriever

class DocumentRetriever(BaseRetriever):
    def __init__(self, model_name: str | None = None):
        self.provider = ModelRouter.get_provider(model_name)

    async def retrieve(self, query: str, user_id: str, **kwargs) -> list[ContentChunk]:
        document_id = kwargs.get("document_id")
        collection_id = kwargs.get("collection_id")
        match_count = kwargs.get("match_count", 20)

        import logging
        import time
        logger = logging.getLogger(__name__)

        async def _run_vector():
            t0 = time.perf_counter()
            try:
                emb = await self.provider.embed_text(query, is_query=True)
                res = await asyncio.to_thread(
                    self._search_scoped, query_text=query, query_embedding=emb, 
                    user_id=user_id, document_id=document_id, collection_id=collection_id, match_count=match_count
                )
                logger.info("[METRIC] Vector Search Time: %.2fms", (time.perf_counter()-t0)*1000)
                return res
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")
                return []

        async def _run_keyword():
            t0 = time.perf_counter()
            try:
                res = await self._search_keyword(query, user_id, document_id, collection_id, match_count)
                logger.info("[METRIC] Keyword Search Time: %.2fms", (time.perf_counter()-t0)*1000)
                return res
            except Exception as e:
                logger.warning(f"Keyword search failed: {e}")
                return []

        vector_results, keyword_results = await asyncio.gather(_run_vector(), _run_keyword())
        
        logger.info(f"[RAG] Vector Results Count: {len(vector_results)}")
        logger.info(f"[RAG] Keyword Results Count: {len(keyword_results)}")

        # Merge results, remove duplicates
        merged = {}
        for m in vector_results:
            merged[str(m["id"])] = m
        for m in keyword_results:
            merged[str(m["id"])] = m
            
        logger.info(f"[RAG] Merged Chunks Count: {len(merged)}")
            
        return [self._content_chunk_from_match(v) for v in merged.values()]

    async def _search_keyword(self, query: str, user_id: str, document_id: str | None, collection_id: str | None, match_count: int) -> list[dict[str, Any]]:
        # First resolve allowed doc IDs to enforce strict RLS/scope from Python without complex joins
        q_docs = supabase.table("documents").select("id").eq("user_id", user_id)
        if document_id:
            q_docs = q_docs.eq("id", document_id)
            
        docs_resp = await asyncio.to_thread(q_docs.execute)
        allowed_docs = [str(r["id"]) for r in (docs_resp.data or [])]
        
        if collection_id and allowed_docs:
            q_col = supabase.table("collection_documents").select("document_id").eq("collection_id", collection_id).in_("document_id", allowed_docs)
            col_resp = await asyncio.to_thread(q_col.execute)
            allowed_docs = list(set([str(r["document_id"]) for r in (col_resp.data or [])]))

        if not allowed_docs:
            return []
            
        def _fetch():
            q = supabase.table("document_chunks")\
                .select("id, document_id, content, chunk_index, metadata")\
                .in_("document_id", allowed_docs)
                
            clean_query = query.strip()
            if clean_query:
                # Uses the pre-calculated 'fts' tsvector column with PostgreSQL websearch_to_tsquery
                q = q.text_search("fts", clean_query, config={"type": "websearch", "config": "english"})
                
            return q.limit(match_count).execute()

        res = await asyncio.to_thread(_fetch)
        return res.data or []

    def _search_scoped(self, query_text: str, query_embedding: list[float], user_id: str, **kwargs) -> list[dict[str, Any]]:
        document_id = kwargs.get("document_id")
        collection_id = kwargs.get("collection_id")
        match_count = kwargs.get("match_count", 20)

        response = supabase.rpc(
            "match_documents_scoped",
            {
                "query_embedding": query_embedding,
                "p_user_id": user_id,
                "p_document_id": document_id,
                "p_collection_id": collection_id,
                "match_count": match_count,
            },
        ).execute()
        return response.data or []

    def _content_chunk_from_match(self, match: dict[str, Any]) -> ContentChunk:
        metadata = dict(match.get("metadata") or {})
        document_title = match.get("document_title") or metadata.get("document_title") or "Document"
        page = metadata.get("page") or match.get("page")
        chunk_index = metadata.get("chunk_index")
        if chunk_index is None:
            chunk_index = match.get("chunk_index")
        collection_name = match.get("collection_name") or metadata.get("collection_name")

        source_parts = [str(document_title)]
        if page:
            source_parts.append(f"page {page}")
        if chunk_index is not None:
            source_parts.append(f"chunk {int(chunk_index) + 1}")
        if collection_name:
            source_parts.append(f"collection {collection_name}")

        metadata.update({
            "document_id": str(match.get("document_id") or metadata.get("document_id") or ""),
            "document_title": document_title,
            "page": page,
            "chunk_index": chunk_index,
            "collection_id": match.get("collection_id") or metadata.get("collection_id"),
            "collection_name": collection_name,
            "score": match.get("score") or match.get("similarity"),
        })
        return ContentChunk(
            id=str(match["id"]),
            content=str(match.get("content") or ""),
            similarity=float(match.get("score") or match.get("similarity") or 0.0),
            source=" - ".join(source_parts),
            metadata=metadata,
        )
