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
    )
    return {"session_id": session_id}


@router.get("")
async def list_sessions(
    module_type: str | None = None,
    limit: int = 50,
    user: AuthenticatedUser = Depends(get_current_user),
):
    from database import supabase

    query = supabase.table("ai_sessions").select("*").eq("user_id", user.id)
    if module_type:
        query = query.eq("module_type", module_type)
    response = await asyncio.to_thread(
        lambda: query.order("updated_at", desc=True).limit(limit).execute()
    )
    return {"sessions": response.data or []}


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


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    title: str | None = None,
    user: AuthenticatedUser = Depends(get_current_user),
):
    from database import supabase

    session = await asyncio.to_thread(MemoryService.get_session, session_id, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    updates: dict[str, Any] = {}
    if title is not None:
        updates["title"] = title

    if updates:
        await asyncio.to_thread(
            lambda: supabase.table("ai_sessions").update(updates).eq("id", session_id).execute()
        )
    return {"status": "updated"}
