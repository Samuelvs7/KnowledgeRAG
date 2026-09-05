"""Mistake notebook: every wrong answer becomes a trackable, practiceable item."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from database import supabase


async def record_mistake(user_id: str, question_id: str, attempt_id: str, subject: str, topic: str) -> None:
    def _upsert():
        existing = (
            supabase.table("mistake_items")
            .select("id")
            .eq("user_id", user_id)
            .eq("question_id", question_id)
            .eq("status", "open")
            .limit(1)
            .execute()
        )
        if existing.data:
            return
        supabase.table("mistake_items").insert({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "question_id": question_id,
            "attempt_id": attempt_id,
            "subject": subject,
            "topic": topic,
            "status": "open",
        }).execute()

    await asyncio.to_thread(_upsert)


async def list_mistakes(user_id: str, status: str | None = None) -> list[dict[str, Any]]:
    def _fetch():
        query = (
            supabase.table("mistake_items")
            .select("*, quiz_questions(question_text, options, correct_answer, explanation, hint, topic, subject)")
            .eq("user_id", user_id)
        )
        if status:
            query = query.eq("status", status)
        resp = query.order("created_at", desc=True).limit(100).execute()
        return resp.data or []

    return await asyncio.to_thread(_fetch)


async def mark_mastered(user_id: str, mistake_id: str) -> None:
    def _update():
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("mistake_items").update({
            "status": "mastered",
            "mastered_at": now,
            "updated_at": now,
        }).eq("id", mistake_id).eq("user_id", user_id).execute()

    await asyncio.to_thread(_update)


async def get_mistake(user_id: str, mistake_id: str) -> dict[str, Any] | None:
    def _fetch():
        resp = (
            supabase.table("mistake_items")
            .select("*")
            .eq("id", mistake_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return resp.data[0] if resp.data else None

    return await asyncio.to_thread(_fetch)


async def bump_review_count(user_id: str, mistake_id: str) -> None:
    def _update():
        existing = (
            supabase.table("mistake_items")
            .select("review_count")
            .eq("id", mistake_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            return
        review_count = int(existing.data[0]["review_count"]) + 1
        supabase.table("mistake_items").update({
            "status": "practicing",
            "review_count": review_count,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", mistake_id).eq("user_id", user_id).execute()

    await asyncio.to_thread(_update)
