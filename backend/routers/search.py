import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import AuthenticatedUser, get_current_user
from database import supabase

router = APIRouter(prefix="/api/search", tags=["search"])
logger = logging.getLogger(__name__)


class SearchResult(BaseModel):
    type: str  # document, collection, session, chunk
    id: str
    title: str
    snippet: str | None = None
    metadata: dict[str, Any] | None = None


@router.get("")
async def global_search(
    q: str = Query(..., min_length=1, max_length=500),
    types: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Search across documents, collections, sessions, and chunks."""
    search_types = set((types or "documents,collections,sessions,chunks").split(","))
    results: list[dict[str, Any]] = []
    pattern = f"%{q}%"

    async def search_documents() -> list[dict[str, Any]]:
        if "documents" not in search_types:
            return []
        response = await asyncio.to_thread(
            lambda: supabase.table("documents")
            .select("id, title, description, file_type, updated_at")
            .eq("user_id", user.id)
            .ilike("title", pattern)
            .limit(limit)
            .execute()
        )
        return [
            {
                "type": "document",
                "id": row["id"],
                "title": row["title"],
                "snippet": row.get("description"),
                "metadata": {"file_type": row.get("file_type"), "updated_at": row.get("updated_at")},
            }
            for row in (response.data or [])
        ]

    async def search_collections() -> list[dict[str, Any]]:
        if "collections" not in search_types:
            return []
        response = await asyncio.to_thread(
            lambda: supabase.table("document_collections")
            .select("id, name, description, updated_at")
            .eq("user_id", user.id)
            .ilike("name", pattern)
            .limit(limit)
            .execute()
        )
        return [
            {
                "type": "collection",
                "id": row["id"],
                "title": row["name"],
                "snippet": row.get("description"),
                "metadata": {"updated_at": row.get("updated_at")},
            }
            for row in (response.data or [])
        ]

    async def search_sessions() -> list[dict[str, Any]]:
        if "sessions" not in search_types:
            return []
        response = await asyncio.to_thread(
            lambda: supabase.table("ai_sessions")
            .select("id, title, module_type, updated_at")
            .eq("user_id", user.id)
            .ilike("title", pattern)
            .limit(limit)
            .execute()
        )
        return [
            {
                "type": "session",
                "id": row["id"],
                "title": row["title"],
                "snippet": row.get("module_type"),
                "metadata": {"module_type": row.get("module_type"), "updated_at": row.get("updated_at")},
            }
            for row in (response.data or [])
        ]

    async def search_chunks() -> list[dict[str, Any]]:
        if "chunks" not in search_types:
            return []
        response = await asyncio.to_thread(
            lambda: supabase.table("document_chunks")
            .select("id, document_id, content, chunk_index, metadata")
            .ilike("content", pattern)
            .limit(limit)
            .execute()
        )
        items = []
        for row in (response.data or []):
            meta = row.get("metadata") or {}
            doc_id = row.get("document_id") or meta.get("document_id")
            items.append({
                "type": "chunk",
                "id": row["id"],
                "title": f"Chunk {row.get('chunk_index', 0) + 1}",
                "snippet": (row.get("content") or "")[:200],
                "metadata": {
                    "document_id": doc_id,
                    "document_title": meta.get("document_title"),
                    "chunk_index": row.get("chunk_index"),
                },
            })
        return items

    all_results = await asyncio.gather(
        search_documents(),
        search_collections(),
        search_sessions(),
        search_chunks(),
        return_exceptions=True,
    )

    for batch in all_results:
        if isinstance(batch, Exception):
            logger.warning("Search sub-query failed", exc_info=batch)
            continue
        results.extend(batch)

    return {"results": results[:limit], "total": len(results)}
