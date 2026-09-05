"""Learning platform API — AI tutor lessons, flashcards, tutor chat, and a
gamified progress overview. Lessons can be grounded in the learner's own
documents (via Document RAG) or taught from general knowledge.
"""
import asyncio
import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from auth import AuthenticatedUser, get_current_user
from database import supabase
from models.schemas import (
    LessonRequest,
    FlashcardsRequest,
    TutorChatRequest,
)
from services.learning import tutor
from services.memory import MemoryService

router = APIRouter(prefix="/api/learning", tags=["learning"])
logger = logging.getLogger(__name__)

XP_PER_LESSON = 25
XP_PER_FLASHCARD_SET = 15
LEVEL_STEP = 100  # XP per level


def _level_for_xp(total_xp: int) -> dict:
    level = 1 + total_xp // LEVEL_STEP
    into = total_xp % LEVEL_STEP
    return {"level": level, "xp_into_level": into, "xp_for_next": LEVEL_STEP, "total_xp": total_xp}


def _touch_streak(user_id: str) -> dict:
    """Increment the daily study streak (idempotent per day)."""
    today = date.today()
    res = supabase.table("learning_streaks").select("*").eq("user_id", user_id).limit(1).execute()
    row = res.data[0] if res.data else None

    if row and row.get("last_study_date"):
        last = date.fromisoformat(str(row["last_study_date"]))
        if last == today:
            return row  # already counted today
        current = (row.get("current_streak") or 0) + 1 if last == today - timedelta(days=1) else 1
    else:
        current = 1

    longest = max((row.get("longest_streak") or 0) if row else 0, current)
    payload = {
        "user_id": user_id,
        "current_streak": current,
        "longest_streak": longest,
        "last_study_date": today.isoformat(),
    }
    supabase.table("learning_streaks").upsert(payload, on_conflict="user_id").execute()
    return payload


def _upsert_topic(user_id: str, *, topic: str, subject: str, level: str,
                  document_id: str | None, lesson: dict | None,
                  add_xp: int, bump: str | None) -> dict:
    existing = (
        supabase.table("learning_topics").select("*").eq("user_id", user_id).eq("topic", topic).limit(1).execute()
    )
    row = existing.data[0] if existing.data else None
    payload: dict = {
        "user_id": user_id,
        "subject": subject,
        "topic": topic,
        "level": level,
        "source_document_id": document_id,
        "last_studied_at": "now()",
        "xp": (row.get("xp") if row else 0) + add_xp,
    }
    if lesson is not None:
        payload["last_lesson"] = lesson
        payload["lessons_completed"] = (row.get("lessons_completed") if row else 0) + 1
    if bump == "flashcards":
        payload["flashcards_reviewed"] = (row.get("flashcards_reviewed") if row else 0) + 1
    supabase.table("learning_topics").upsert(payload, on_conflict="user_id,topic").execute()
    return payload


@router.get("/overview")
async def overview(user: AuthenticatedUser = Depends(get_current_user)):
    def _load():
        topics = (
            supabase.table("learning_topics")
            .select("id, subject, topic, level, source_document_id, lessons_completed, flashcards_reviewed, quizzes_taken, xp, last_studied_at")
            .eq("user_id", user.id)
            .order("last_studied_at", desc=True)
            .limit(50)
            .execute()
        ).data or []
        streak = (
            supabase.table("learning_streaks").select("*").eq("user_id", user.id).limit(1).execute()
        ).data or []
        documents = (
            supabase.table("documents")
            .select("id, title, file_type, created_at")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        ).data or []
        mastery = (
            supabase.table("topic_mastery")
            .select("subject, topic, mastery_score, accuracy")
            .eq("user_id", user.id)
            .execute()
        ).data or []
        return topics, (streak[0] if streak else None), documents, mastery

    topics, streak, documents, mastery = await asyncio.to_thread(_load)

    total_xp = sum(int(t.get("xp") or 0) for t in topics)
    mastery_by_topic = {m["topic"]: m for m in mastery}

    # Recommendations: next_topics from recent lessons + weak mastery, minus already-studied.
    studied = {t["topic"].lower() for t in topics}
    recommendations: list[dict] = []
    for m in sorted(mastery, key=lambda x: float(x.get("mastery_score") or 0))[:3]:
        if float(m.get("mastery_score") or 0) < 70:
            recommendations.append({"topic": m["topic"], "subject": m.get("subject", "General"),
                                     "reason": f"Mastery {float(m['mastery_score']):.0f}% — worth another pass"})

    return {
        "progress": _level_for_xp(total_xp),
        "streak": {
            "current": (streak or {}).get("current_streak", 0),
            "longest": (streak or {}).get("longest_streak", 0),
            "last_study_date": (streak or {}).get("last_study_date"),
        },
        "stats": {
            "topics_started": len(topics),
            "lessons_completed": sum(int(t.get("lessons_completed") or 0) for t in topics),
            "flashcards_reviewed": sum(int(t.get("flashcards_reviewed") or 0) for t in topics),
        },
        "continue_learning": [
            {**t, "mastery": mastery_by_topic.get(t["topic"], {}).get("mastery_score")}
            for t in topics[:4]
        ],
        "topics": topics,
        "documents": documents,
        "recommendations": recommendations,
    }


@router.get("/topics/{topic_id}")
async def get_topic(topic_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    res = (
        supabase.table("learning_topics").select("*").eq("id", topic_id).eq("user_id", user.id).limit(1).execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Topic not found")
    return res.data[0]


@router.post("/lesson")
async def create_lesson(req: LessonRequest, user: AuthenticatedUser = Depends(get_current_user)):
    topic = (req.topic or "").strip()
    if not topic:
        raise HTTPException(status_code=422, detail="A topic is required")
    subject = (req.subject or "General").strip() or "General"
    level = req.level if req.level in ("beginner", "intermediate", "advanced") else "beginner"

    try:
        lesson = await tutor.generate_lesson(
            user_id=user.id, topic=topic, subject=subject, level=level, document_id=req.document_id,
        )
    except Exception:
        logger.exception("[LEARNING] lesson generation failed")
        raise HTTPException(status_code=502, detail="Couldn't generate this lesson. Please try again.")

    def _persist():
        _upsert_topic(user.id, topic=topic, subject=subject, level=level,
                      document_id=req.document_id, lesson=lesson, add_xp=XP_PER_LESSON, bump=None)
        _touch_streak(user.id)

    await asyncio.to_thread(_persist)
    return {"lesson": lesson, "xp_earned": XP_PER_LESSON}


@router.post("/flashcards")
async def create_flashcards(req: FlashcardsRequest, user: AuthenticatedUser = Depends(get_current_user)):
    topic = (req.topic or "").strip()
    if not topic:
        raise HTTPException(status_code=422, detail="A topic is required")
    try:
        cards = await tutor.generate_flashcards(
            user_id=user.id, topic=topic, count=req.count or 8, document_id=req.document_id,
        )
    except Exception:
        logger.exception("[LEARNING] flashcard generation failed")
        raise HTTPException(status_code=502, detail="Couldn't generate flashcards. Please try again.")

    if not cards:
        raise HTTPException(status_code=422, detail="No flashcards could be generated for this topic.")

    def _persist():
        _upsert_topic(user.id, topic=topic, subject=(req.subject or "General"), level="beginner",
                      document_id=req.document_id, lesson=None, add_xp=XP_PER_FLASHCARD_SET, bump="flashcards")
        _touch_streak(user.id)

    await asyncio.to_thread(_persist)
    return {"flashcards": cards, "xp_earned": XP_PER_FLASHCARD_SET}


@router.post("/chat")
async def chat(req: TutorChatRequest, user: AuthenticatedUser = Depends(get_current_user)):
    query = (req.query or "").strip()
    if not query:
        raise HTTPException(status_code=422, detail="A message is required")

    session_id = req.session_id
    if not session_id:
        session = await asyncio.to_thread(
            MemoryService.create_session, user.id, "learning", f"Tutor: {query[:30]}"
        )
        session_id = session.get("id") if isinstance(session, dict) else str(session)

    history = []
    if session_id:
        try:
            history = await asyncio.to_thread(MemoryService.get_history, session_id, 8)
        except Exception:
            history = []

    try:
        answer = await tutor.tutor_chat(
            user_id=user.id, query=query, history=history, topic=req.topic, document_id=req.document_id,
        )
    except Exception:
        logger.exception("[LEARNING] tutor chat failed")
        raise HTTPException(status_code=502, detail="The tutor is unavailable right now. Please try again.")

    if session_id:
        await asyncio.to_thread(MemoryService.add_message, session_id, "user", query)
        await asyncio.to_thread(MemoryService.add_message, session_id, "assistant", answer)

    return {"answer": answer, "session_id": session_id}
