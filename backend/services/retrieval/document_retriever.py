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
        logger = logging.getLogger(__name__)

        try:
            # Generate embedding using the abstracted provider
            query_embedding = await self.provider.embed_text(query, is_query=True)

            # Call the new hybrid RPC
            matches = await asyncio.to_thread(
                self._search_scoped,
                query_text=query,
                query_embedding=query_embedding,
                user_id=user_id,
                document_id=document_id,
                collection_id=collection_id,
                match_count=match_count
            )

            # Maps matches to ContentChunk schema structure used in the router
            return [self._content_chunk_from_match(match) for match in matches]
        except Exception as exc:
            logger.warning("[FAILSAFE] Generating query embedding failed, falling back to text-only retrieval: %s", str(exc))
            return await self._fallback_text_retrieve(query, user_id, document_id=document_id, collection_id=collection_id, match_count=match_count)

    async def _fallback_text_retrieve(self, query: str, user_id: str, **kwargs) -> list[ContentChunk]:
        """Direct table query fallback when embedding fails (keyword-like via ilike or scope filtering)"""
        document_id = kwargs.get("document_id")
        limit = kwargs.get("match_count", 20)
        
        # Simple query directly against chunks table
        def _fetch():
            q = supabase.table("document_chunks")\
                .select("id, document_id, content, chunk_index, metadata")
            
            if document_id:
                # Scoped to specific document (very common for demo)
                q = q.eq("document_id", document_id)
            else:
                # Global or collection search - naive ilike, demo only fallback
                # In a real app we'd join with user_id/permissions
                words = [w for w in query.split() if len(w) > 3][:3]
                if words:
                    q = q.ilike("content", f"%{words[0]}%")
                    
            return q.limit(limit).execute()
        
        response = await asyncio.to_thread(_fetch)
        data = response.data or []
        
        chunks = []
        for row in data:
            metadata = row.get("metadata") or {}
            doc_id = row.get("document_id") or metadata.get("document_id")
            doc_title = metadata.get("document_title") or "Document"
            idx = row.get("chunk_index", 0)
            metadata.update({
                "document_id": str(doc_id) if doc_id else "",
                "document_title": doc_title,
                "chunk_index": idx,
                "score": 0.5
            })
            chunks.append(ContentChunk(
                id=str(row["id"]),
                content=str(row.get("content") or ""),
                similarity=0.5,
                source=f"{doc_title} - chunk {int(idx) + 1}",
                metadata=metadata
            ))
        return chunks

    def _search_scoped(self, query_text: str, query_embedding: list[float], user_id: str, **kwargs) -> list[dict[str, Any]]:
        document_id = kwargs.get("document_id")
        collection_id = kwargs.get("collection_id")
        match_count = kwargs.get("match_count", 20)

        response = supabase.rpc(
            "match_documents_hybrid",
            {
                "query_text": query_text,
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
            "score": match.get("score"), # Storing the RRF score
        })
        return ContentChunk(
            id=str(match["id"]),
            content=str(match.get("content") or ""),
            similarity=float(match.get("score") or 0), # Override similarity with RRF score for now
            source=" - ".join(source_parts),
            metadata=metadata,
        )
