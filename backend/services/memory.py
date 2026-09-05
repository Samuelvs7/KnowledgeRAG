import time
from typing import Any
from database import supabase

def format_session(session_data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not session_data:
        return None
    data = dict(session_data)
    meta = data.get("metadata") or {}
    data["scope_type"] = meta.get("scope_type") or data.get("scope_type") or "all"
    data["scope_document_id"] = meta.get("scope_document_id") if "scope_document_id" in meta else data.get("scope_document_id")
    data["scope_collection_id"] = meta.get("scope_collection_id") if "scope_collection_id" in meta else data.get("scope_collection_id")
    data["scope_document_title"] = meta.get("scope_document_title") if "scope_document_title" in meta else data.get("scope_document_title")
    return data


class ConversationService:
    @staticmethod
    def create_session(user_id: str, module_type: str, title: str, metadata: dict[str, Any] | None = None, **kwargs) -> str:
        session_meta = metadata or {}
        if "workspace_id" in kwargs:
            session_meta["workspace_id"] = kwargs["workspace_id"]
        if "model" in kwargs:
            session_meta["model"] = kwargs["model"]
        if "settings_json" in kwargs:
            session_meta["settings"] = kwargs["settings_json"]
        if "scope_type" in kwargs and kwargs["scope_type"]:
            session_meta["scope_type"] = kwargs["scope_type"]
        if "scope_document_id" in kwargs:
            session_meta["scope_document_id"] = kwargs["scope_document_id"]
        if "scope_collection_id" in kwargs:
            session_meta["scope_collection_id"] = kwargs["scope_collection_id"]
        if "scope_document_title" in kwargs:
            session_meta["scope_document_title"] = kwargs["scope_document_title"]
            
        try:
            response = supabase.table("ai_sessions").insert({
                "user_id": user_id,
                "module_type": module_type,
                "title": title,
                "metadata": session_meta
            }).execute()
            if response.data:
                return str(response.data[0]["id"])
        except Exception as e:
            import logging, uuid
            logging.getLogger(__name__).warning(f"Failed to insert DB session for user {user_id}: {e}")
        
        import uuid
        return str(uuid.uuid4())
        
    @staticmethod
    def update_session_scope(session_id: str, scope_type: str, scope_document_id: str | None = None, scope_collection_id: str | None = None, scope_document_title: str | None = None) -> None:
        try:
            session_resp = supabase.table("ai_sessions").select("metadata").eq("id", session_id).limit(1).execute()
            if not session_resp.data:
                return
            meta = session_resp.data[0].get("metadata") or {}
            meta["scope_type"] = scope_type
            meta["scope_document_id"] = scope_document_id
            meta["scope_collection_id"] = scope_collection_id
            if scope_document_title is not None:
                meta["scope_document_title"] = scope_document_title
                
            supabase.table("ai_sessions").update({
                "metadata": meta,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }).eq("id", session_id).execute()
        except Exception:
            pass

    @staticmethod
    def get_session(session_id: str, user_id: str) -> dict[str, Any] | None:
        try:
            response = supabase.table("ai_sessions").select("*").eq("id", session_id).eq("user_id", user_id).limit(1).execute()
            return format_session(response.data[0]) if response.data else None
        except Exception:
            return None

    @staticmethod
    def list_sessions(user_id: str, agent_type: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        try:
            query = supabase.table("ai_sessions").select("*").eq("user_id", user_id)
            if agent_type:
                query = query.eq("module_type", agent_type)
            response = query.order("updated_at", desc=True).limit(limit).execute()
            return [format_session(s) for s in (response.data or []) if s]
        except Exception:
            return []

    @staticmethod
    def add_message(session_id: str, role: str, content: str, citations: list[dict[str, Any]] | None = None) -> None:
        if role not in ('user', 'assistant', 'system'):
            raise ValueError(f"Invalid message role: {role}")
            
        try:
            supabase.table("ai_messages").insert({
                "session_id": session_id,
                "role": role,
                "content": content,
                "citations_json": citations or []
            }).execute()
            
            supabase.table("ai_sessions").update({
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }).eq("id", session_id).execute()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to record message in session memory: {e}")
        
    @staticmethod
    def get_history(session_id: str, limit: int = 20) -> list[dict[str, Any]]:
        response = supabase.table("ai_messages").select("*").eq("session_id", session_id).order("created_at", desc=True).limit(limit).execute()
        return list(reversed(response.data or []))

# Backward compatibility alias
MemoryService = ConversationService

