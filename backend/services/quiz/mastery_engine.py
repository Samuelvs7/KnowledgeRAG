"""Topic mastery tracking. Mastery is a recency-weighted rolling score, not
a raw quiz score, so a single lucky/unlucky quiz can't swing it wildly.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from database import supabase

EMA_WEIGHT = 0.3

MASTERY_LABELS = (
    (90, "Mastered", "You've mastered this topic."),
    (80, "Strong", "You have a strong grasp of this topic."),
    (70, "Good Progress", "You're making good progress on this topic."),
    (50, "Developing", "You're developing confidence in this topic."),
    (0, "Needs Review", "This topic needs more review."),
)


def classify_mastery(score: float) -> tuple[str, str]:
    for threshold, label, message in MASTERY_LABELS:
        if score >= threshold:
            return label, message
    return MASTERY_LABELS[-1][1], MASTERY_LABELS[-1][2]


async def update_mastery(user_id: str, subject: str, topic: str, correct: bool) -> dict[str, Any]:
    return await asyncio.to_thread(_update_mastery_sync, user_id, subject, topic, correct)


def _update_mastery_sync(user_id: str, subject: str, topic: str, correct: bool) -> dict[str, Any]:
    existing = (
        supabase.table("topic_mastery")
        .select("*")
        .eq("user_id", user_id)
        .eq("subject", subject)
        .eq("topic", topic)
        .limit(1)
        .execute()
    )
    now = datetime.now(timezone.utc).isoformat()
    sample_score = 100.0 if correct else 0.0

    if existing.data:
        row = existing.data[0]
        new_score = round(float(row["mastery_score"]) * (1 - EMA_WEIGHT) + sample_score * EMA_WEIGHT, 2)
        questions_attempted = int(row["questions_attempted"]) + 1
        correct_count = int(row["correct_count"]) + (1 if correct else 0)
        accuracy = round(100 * correct_count / questions_attempted, 2)
        update = {
            "mastery_score": new_score,
            "accuracy": accuracy,
            "questions_attempted": questions_attempted,
            "correct_count": correct_count,
            "last_practiced_at": now,
            "updated_at": now,
        }
        supabase.table("topic_mastery").update(update).eq("id", row["id"]).execute()
        return {**row, **update}

    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "subject": subject,
        "topic": topic,
        "mastery_score": sample_score * EMA_WEIGHT,
        "accuracy": sample_score,
        "questions_attempted": 1,
        "correct_count": 1 if correct else 0,
        "last_practiced_at": now,
        "updated_at": now,
    }
    supabase.table("topic_mastery").insert(row).execute()
    return row


async def get_mastery_for_user(user_id: str) -> list[dict[str, Any]]:
    def _fetch():
        resp = (
            supabase.table("topic_mastery")
            .select("*")
            .eq("user_id", user_id)
            .order("mastery_score")
            .execute()
        )
        return resp.data or []

    return await asyncio.to_thread(_fetch)
