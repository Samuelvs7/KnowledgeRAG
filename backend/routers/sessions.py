import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import AuthenticatedUser, get_current_user
from services.memory import MemoryService

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
logger = logging.getLogger(__name__)


class CreateSessionRequest(BaseModel):
    module_type: str = "document_rag"
    title: str = "New Conversation"
    metadata: dict[str, Any] | None = None
    scope_type: str | None = None
    scope_document_id: str | None = None
    scope_collection_id: str | None = None
    scope_document_title: str | None = None


class AddMessageRequest(BaseModel):
    role: str
    content: str
    citations: list[dict[str, Any]] | None = None


@router.post("")
async def create_session(
    req: CreateSessionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    session_id = await asyncio.to_thread(
        MemoryService.create_session,
        user.id,
        req.module_type,
        req.title,
        req.metadata,
        scope_type=req.scope_type,
        scope_document_id=req.scope_document_id,
        scope_collection_id=req.scope_collection_id,
        scope_document_title=req.scope_document_title,
    )
    return {"session_id": session_id}


@router.get("")
async def list_sessions(
    module_type: str | None = None,
    limit: int = 50,
    user: AuthenticatedUser = Depends(get_current_user),
):
    sessions = await asyncio.to_thread(
        MemoryService.list_sessions,
        user.id,
        module_type,
        limit,
    )
    return {"sessions": sessions}


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    session = await asyncio.to_thread(MemoryService.get_session, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    limit: int = 50,
    user: AuthenticatedUser = Depends(get_current_user),
):
    session = await asyncio.to_thread(MemoryService.get_session, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = await asyncio.to_thread(MemoryService.get_history, session_id, limit)
    return {"messages": messages}


@router.post("/{session_id}/messages")
async def add_message(
    session_id: str,
    req: AddMessageRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    session = await asyncio.to_thread(MemoryService.get_session, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await asyncio.to_thread(
        MemoryService.add_message,
        session_id,
        req.role,
        req.content,
        req.citations,
    )
    return {"status": "ok"}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    from database import supabase

    session = await asyncio.to_thread(MemoryService.get_session, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await asyncio.to_thread(
        lambda: supabase.table("ai_sessions").delete().eq("id", session_id).execute()
    )
    return {"status": "deleted"}


class UpdateSessionRequest(BaseModel):
    title: str | None = None
    scope_type: str | None = None
    scope_document_id: str | None = None
    scope_collection_id: str | None = None
    scope_document_title: str | None = None


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    req: UpdateSessionRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    session = await asyncio.to_thread(MemoryService.get_session, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if req.title is not None:
        from database import supabase
        await asyncio.to_thread(
            lambda: supabase.table("ai_sessions").update({"title": req.title}).eq("id", session_id).execute()
        )

    if req.scope_type is not None:
        await asyncio.to_thread(
            MemoryService.update_session_scope,
            session_id,
            req.scope_type,
            req.scope_document_id,
            req.scope_collection_id,
            req.scope_document_title,
        )

    return {"status": "updated"}
