import time
from typing import Any
from database import supabase

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
            
        response = supabase.table("ai_sessions").insert({
            "user_id": user_id,
            "module_type": module_type,
            "title": title,
            "metadata": session_meta
        }).execute()
        
        if not response.data:
            raise RuntimeError("Failed to create AI session")
            
        return str(response.data[0]["id"])
        
    @staticmethod
    def get_session(session_id: str, user_id: str) -> dict[str, Any] | None:
        response = supabase.table("ai_sessions").select("*").eq("id", session_id).eq("user_id", user_id).limit(1).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def list_sessions(user_id: str, agent_type: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        query = supabase.table("ai_sessions").select("*").eq("user_id", user_id)
        if agent_type:
            query = query.eq("module_type", agent_type)
        response = query.order("updated_at", desc=True).limit(limit).execute()
        return response.data or []

    @staticmethod
    def add_message(session_id: str, role: str, content: str, citations: list[dict[str, Any]] | None = None) -> None:
        if role not in ('user', 'assistant', 'system'):
            raise ValueError(f"Invalid message role: {role}")
            
        supabase.table("ai_messages").insert({
            "session_id": session_id,
            "role": role,
            "content": content,
            "citations_json": citations or []
        }).execute()
        
        supabase.table("ai_sessions").update({
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }).eq("id", session_id).execute()
        
    @staticmethod
    def get_history(session_id: str, limit: int = 20) -> list[dict[str, Any]]:
        response = supabase.table("ai_messages").select("*").eq("session_id", session_id).order("created_at", desc=True).limit(limit).execute()
        return list(reversed(response.data or []))

# Backward compatibility alias
MemoryService = ConversationService

