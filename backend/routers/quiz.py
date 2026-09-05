import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import AuthenticatedUser, get_current_user
from database import supabase
from models.schemas import (
    MistakeItemOut,
    QuizAnswerRequest,
    QuizAnswerResponse,
    QuizCompleteResponse,
    QuizDashboardResponse,
    QuizAnswerRecord,
    QuizGenerateRequest,
    QuizOut,
    QuizQuestionOut,
    QuizResumeResponse,
    QuizStartResponse,
    RecentQuizItem,
    TopicMasteryOut,
)
from services.ai.router import ModelRouter
from services.quiz import mastery_engine, mistake_service
from services.quiz.quiz_generator import QuizGenerationError, generate_quiz

router = APIRouter(prefix="/api/quiz", tags=["quiz"])
logger = logging.getLogger(__name__)


def _question_to_out(row: dict) -> QuizQuestionOut:
    return QuizQuestionOut(
        id=row["id"],
        question_text=row["question_text"],
        options=row["options"],
        hint=row.get("hint"),
        topic=row["topic"],
        subject=row["subject"],
        difficulty=row["difficulty"],
        order_index=row.get("order_index", 0),
        source_excerpt=row.get("source_excerpt"),
    )


def _quiz_to_out(quiz: dict, questions: list[dict]) -> QuizOut:
    return QuizOut(
        id=quiz["id"],
        title=quiz["title"],
        subject=quiz["subject"],
        topic=quiz["topic"],
        difficulty=quiz["difficulty"],
        mode=quiz["mode"],
        source=quiz["source"],
        question_count=quiz["question_count"],
        status=quiz["status"],
        questions=[_question_to_out(q) for q in sorted(questions, key=lambda q: q.get("order_index", 0))],
    )


@router.post("/generate", response_model=QuizOut)
async def create_quiz(req: QuizGenerateRequest, user: AuthenticatedUser = Depends(get_current_user)):
    try:
        result = await generate_quiz(
            user_id=user.id,
            subject=req.subject,
            topic=req.topic,
            difficulty=req.difficulty,
            question_count=req.question_count,
            source=req.source,
            document_id=req.document_id,
        )
    except QuizGenerationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[FAILED] quiz.generate")
        raise HTTPException(status_code=502, detail="We couldn't generate this quiz. Please try again.") from exc

    return _quiz_to_out(result["quiz"], result["questions"])


def _get_owned_quiz(quiz_id: str, user_id: str) -> dict:
    resp = supabase.table("quizzes").select("*").eq("id", quiz_id).eq("user_id", user_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return resp.data[0]


def _get_owned_attempt(attempt_id: str, user_id: str) -> dict:
    resp = supabase.table("quiz_attempts").select("*").eq("id", attempt_id).eq("user_id", user_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Quiz attempt not found")
    return resp.data[0]


@router.post("/{quiz_id}/start", response_model=QuizStartResponse)
async def start_quiz(quiz_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    def _run():
        quiz = _get_owned_quiz(quiz_id, user.id)
        questions = (
            supabase.table("quiz_questions")
            .select("*")
            .eq("quiz_id", quiz_id)
            .order("order_index")
            .execute()
        ).data or []
        attempt = {
            "id": str(uuid.uuid4()),
            "user_id": user.id,
            "quiz_id": quiz_id,
            "status": "in_progress",
        }
        supabase.table("quiz_attempts").insert(attempt).execute()
        return quiz, questions, attempt["id"]

    quiz, questions, attempt_id = await asyncio.to_thread(_run)
    return QuizStartResponse(attempt_id=attempt_id, quiz=_quiz_to_out(quiz, questions))


@router.get("/attempts/{attempt_id}/resume", response_model=QuizResumeResponse)
async def resume_quiz(attempt_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    def _run():
        attempt = _get_owned_attempt(attempt_id, user.id)
        quiz = _get_owned_quiz(attempt["quiz_id"], user.id)
        questions = (
            supabase.table("quiz_questions")
            .select("*")
            .eq("quiz_id", attempt["quiz_id"])
            .order("order_index")
            .execute()
        ).data or []
        answers = (
            supabase.table("quiz_answers").select("*").eq("attempt_id", attempt_id).execute()
        ).data or []
        return quiz, questions, answers

    quiz, questions, answers = await asyncio.to_thread(_run)
    questions_by_id = {q["id"]: q for q in questions}
    answer_records = []
    for answer in answers:
        question = questions_by_id.get(answer["question_id"])
        if not question:
            continue
        answer_records.append(QuizAnswerRecord(
            question_id=answer["question_id"],
            selected_answer=answer.get("selected_answer"),
            is_correct=answer["is_correct"],
            is_unknown=answer["is_unknown"],
            correct_answer=question["correct_answer"],
            explanation=question["explanation"],
        ))

    return QuizResumeResponse(
        attempt_id=attempt_id,
        quiz=_quiz_to_out(quiz, questions),
        answers=answer_records,
    )


@router.post("/attempts/{attempt_id}/answer", response_model=QuizAnswerResponse)
async def submit_answer(
    attempt_id: str,
    req: QuizAnswerRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    def _run():
        attempt = _get_owned_attempt(attempt_id, user.id)
        q_resp = (
            supabase.table("quiz_questions").select("*").eq("id", req.question_id).eq("quiz_id", attempt["quiz_id"]).limit(1).execute()
        )
        if not q_resp.data:
            raise HTTPException(status_code=404, detail="Question not found")
        question = q_resp.data[0]

        is_correct = (not req.is_unknown) and req.selected_answer is not None and (
            req.selected_answer.strip() == question["correct_answer"].strip()
        )

        def category(correct: bool, unknown: bool) -> str:
            if unknown:
                return "unknown"
            return "correct" if correct else "incorrect"

        existing = (
            supabase.table("quiz_answers")
            .select("*")
            .eq("attempt_id", attempt_id)
            .eq("question_id", req.question_id)
            .limit(1)
            .execute()
        )
        old_category = None
        if existing.data:
            old = existing.data[0]
            old_category = category(old["is_correct"], old["is_unknown"])

        new_category = category(is_correct, req.is_unknown)

        answer_row = {
            "attempt_id": attempt_id,
            "question_id": req.question_id,
            "selected_answer": req.selected_answer,
            "is_correct": is_correct,
            "is_unknown": req.is_unknown,
            "used_hint": req.used_hint,
            "time_spent_seconds": req.time_spent_seconds,
        }
        supabase.table("quiz_answers").upsert(answer_row, on_conflict="attempt_id,question_id").execute()

        counters = {
            "correct_count": attempt["correct_count"],
            "incorrect_count": attempt["incorrect_count"],
            "unknown_count": attempt["unknown_count"],
        }
        key_map = {"correct": "correct_count", "incorrect": "incorrect_count", "unknown": "unknown_count"}
        if old_category:
            counters[key_map[old_category]] = max(0, counters[key_map[old_category]] - 1)
        counters[key_map[new_category]] += 1
        supabase.table("quiz_attempts").update(counters).eq("id", attempt_id).execute()

        return question, is_correct

    question, is_correct = await asyncio.to_thread(_run)
    mastery = await mastery_engine.update_mastery(user.id, question["subject"], question["topic"], is_correct)
    label, _ = mastery_engine.classify_mastery(float(mastery["mastery_score"]))

    return QuizAnswerResponse(
        is_correct=is_correct,
        correct_answer=question["correct_answer"],
        explanation=question["explanation"],
        mastery_score=float(mastery["mastery_score"]),
        mastery_label=label,
    )


async def _generate_learning_insight(topic_breakdown: list[dict], score: float) -> str:
    if not topic_breakdown:
        return "Complete a few more quizzes and we'll start surfacing insights about your strengths and weak spots."

    strongest = max(topic_breakdown, key=lambda t: t["accuracy"])
    weakest = min(topic_breakdown, key=lambda t: t["accuracy"])
    fallback = (
        f"You scored {score:.0f}% this quiz. Your strongest area was {strongest['topic']} "
        f"({strongest['accuracy']:.0f}%). Focus next on {weakest['topic']} ({weakest['accuracy']:.0f}%)."
    )
    try:
        provider = ModelRouter.get_provider()
        prompt = (
            "Write a warm, 2-3 sentence learning insight for a student based on this quiz performance. "
            "Name their strongest topic and their weakest topic, and suggest one concrete next step. "
            f"Overall score: {score:.0f}%. Topic breakdown: {topic_breakdown}."
        )
        result = await provider.generate_text(prompt, system_instruction="You are a supportive learning coach.")
        text = result.text.strip()
        return text or fallback
    except Exception:
        logger.exception("[FAILED] quiz.learning_insight")
        return fallback


@router.post("/attempts/{attempt_id}/complete", response_model=QuizCompleteResponse)
async def complete_quiz(attempt_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    def _load():
        attempt = _get_owned_attempt(attempt_id, user.id)
        questions = (
            supabase.table("quiz_questions").select("*").eq("quiz_id", attempt["quiz_id"]).execute()
        ).data or []
        answers = (
            supabase.table("quiz_answers").select("*").eq("attempt_id", attempt_id).execute()
        ).data or []
        return attempt, questions, answers

    attempt, questions, answers = await asyncio.to_thread(_load)

    questions_by_id = {q["id"]: q for q in questions}
    total = len(questions)
    answered_ids = {a["question_id"] for a in answers}
    skipped_count = max(0, total - len(answered_ids))
    correct_count = sum(1 for a in answers if a["is_correct"])
    incorrect_count = sum(1 for a in answers if not a["is_correct"] and not a["is_unknown"])
    unknown_count = sum(1 for a in answers if a["is_unknown"])
    time_spent = sum(int(a.get("time_spent_seconds") or 0) for a in answers)
    accuracy = round(100 * correct_count / total, 2) if total else 0.0

    topic_stats: dict[tuple[str, str], dict] = {}
    for answer in answers:
        question = questions_by_id.get(answer["question_id"])
        if not question:
            continue
        key = (question["subject"], question["topic"])
        stats = topic_stats.setdefault(key, {"correct": 0, "total": 0})
        stats["total"] += 1
        if answer["is_correct"]:
            stats["correct"] += 1

    topic_breakdown = [
        {"subject": subject, "topic": topic, "accuracy": round(100 * s["correct"] / s["total"], 2)}
        for (subject, topic), s in topic_stats.items()
        if s["total"]
    ]

    classification, _ = mastery_engine.classify_mastery(accuracy)

    for answer in answers:
        if answer["is_correct"]:
            continue
        question = questions_by_id.get(answer["question_id"])
        if not question:
            continue
        await mistake_service.record_mistake(
            user.id, answer["question_id"], attempt_id, question["subject"], question["topic"]
        )

    learning_insight = await _generate_learning_insight(topic_breakdown, accuracy)

    def _finalize():
        supabase.table("quiz_attempts").update({
            "status": "completed",
            "score": accuracy,
            "accuracy": accuracy,
            "skipped_count": skipped_count,
            "time_spent_seconds": time_spent,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", attempt_id).execute()

    await asyncio.to_thread(_finalize)

    return QuizCompleteResponse(
        attempt_id=attempt_id,
        score=accuracy,
        accuracy=accuracy,
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        unknown_count=unknown_count,
        skipped_count=skipped_count,
        time_spent_seconds=time_spent,
        classification=classification,
        topic_breakdown=topic_breakdown,
        learning_insight=learning_insight,
    )


@router.get("/history")
async def get_history(user: AuthenticatedUser = Depends(get_current_user)):
    def _fetch():
        resp = (
            supabase.table("quiz_attempts")
            .select("*, quizzes(title, question_count)")
            .eq("user_id", user.id)
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .limit(50)
            .execute()
        )
        items = []
        for row in resp.data or []:
            quiz = row.get("quizzes") or {}
            items.append(RecentQuizItem(
                attempt_id=row["id"],
                title=quiz.get("title", "Quiz"),
                question_count=quiz.get("question_count", 0),
                correct_count=row["correct_count"],
                accuracy=row.get("accuracy"),
                completed_at=row.get("completed_at"),
            ))
        return items

    return {"attempts": await asyncio.to_thread(_fetch)}


@router.get("/mistakes")
async def get_mistakes(status: str | None = None, user: AuthenticatedUser = Depends(get_current_user)):
    rows = await mistake_service.list_mistakes(user.id, status)
    items = []
    for row in rows:
        question = row.get("quiz_questions") or {}
        items.append(MistakeItemOut(
            id=row["id"],
            question_id=row["question_id"],
            subject=row["subject"],
            topic=row["topic"],
            status=row["status"],
            review_count=row["review_count"],
            question_text=question.get("question_text"),
            options=question.get("options"),
            correct_answer=question.get("correct_answer"),
            explanation=question.get("explanation"),
            hint=question.get("hint"),
        ))
    return {"mistakes": items}


@router.post("/mistakes/{mistake_id}/practice", response_model=QuizOut)
async def practice_mistake(mistake_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    mistake = await mistake_service.get_mistake(user.id, mistake_id)
    if not mistake:
        raise HTTPException(status_code=404, detail="Mistake not found")

    try:
        result = await generate_quiz(
            user_id=user.id,
            subject=mistake["subject"],
            topic=mistake["topic"],
            difficulty="medium",
            question_count=5,
            source="mistakes",
        )
    except QuizGenerationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[FAILED] quiz.practice_mistake")
        raise HTTPException(status_code=502, detail="We couldn't generate practice questions. Please try again.") from exc

    await mistake_service.bump_review_count(user.id, mistake_id)
    return _quiz_to_out(result["quiz"], result["questions"])


@router.post("/mistakes/{mistake_id}/master")
async def master_mistake(mistake_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    await mistake_service.mark_mastered(user.id, mistake_id)
    return {"status": "ok"}


@router.get("/mastery")
async def get_mastery(user: AuthenticatedUser = Depends(get_current_user)):
    rows = await mastery_engine.get_mastery_for_user(user.id)
    items = []
    for row in rows:
        label, _ = mastery_engine.classify_mastery(float(row["mastery_score"]))
        items.append(TopicMasteryOut(
            subject=row["subject"],
            topic=row["topic"],
            mastery_score=float(row["mastery_score"]),
            accuracy=float(row["accuracy"]),
            questions_attempted=row["questions_attempted"],
            label=label,
        ))
    return {"mastery": items}


@router.get("/dashboard", response_model=QuizDashboardResponse)
async def get_dashboard(user: AuthenticatedUser = Depends(get_current_user)):
    def _load():
        mastery_rows = (
            supabase.table("topic_mastery").select("*").eq("user_id", user.id).execute()
        ).data or []
        in_progress = (
            supabase.table("quiz_attempts")
            .select("*, quizzes(title, subject, topic, question_count)")
            .eq("user_id", user.id)
            .eq("status", "in_progress")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        completed = (
            supabase.table("quiz_attempts")
            .select("*, quizzes(title, question_count)")
            .eq("user_id", user.id)
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .limit(5)
            .execute()
        ).data or []
        open_mistakes = (
            supabase.table("mistake_items").select("id").eq("user_id", user.id).eq("status", "open").execute()
        ).data or []
        return mastery_rows, in_progress, completed, open_mistakes

    mastery_rows, in_progress, completed, open_mistakes = await asyncio.to_thread(_load)

    overall_mastery = round(sum(float(m["mastery_score"]) for m in mastery_rows) / len(mastery_rows), 2) if mastery_rows else 0.0
    questions_answered = sum(int(m["questions_attempted"]) for m in mastery_rows)
    correct_total = sum(int(m["correct_count"]) for m in mastery_rows)
    accuracy = round(100 * correct_total / questions_answered, 2) if questions_answered else 0.0
    topics_mastered = sum(1 for m in mastery_rows if float(m["mastery_score"]) >= 90)

    weak = sorted(mastery_rows, key=lambda m: float(m["mastery_score"]))[:3]
    weak_areas = []
    for row in weak:
        if float(row["mastery_score"]) >= 70:
            continue
        label, _ = mastery_engine.classify_mastery(float(row["mastery_score"]))
        weak_areas.append(TopicMasteryOut(
            subject=row["subject"], topic=row["topic"], mastery_score=float(row["mastery_score"]),
            accuracy=float(row["accuracy"]), questions_attempted=row["questions_attempted"], label=label,
        ))

    continue_learning = None
    if in_progress:
        attempt = in_progress[0]
        quiz = attempt.get("quizzes") or {}
        total_q = quiz.get("question_count") or 1
        continue_learning = {
            "subject": quiz.get("subject", ""),
            "topic": quiz.get("topic", ""),
            "quiz_id": attempt["quiz_id"],
            "attempt_id": attempt["id"],
            "progress_percent": round(100 * attempt["current_question_index"] / total_q, 2),
            "reason": "Continue where you left off",
        }
    elif weak_areas:
        continue_learning = {
            "subject": weak_areas[0].subject,
            "topic": weak_areas[0].topic,
            "quiz_id": None,
            "attempt_id": None,
            "progress_percent": None,
            "reason": f"Practice {weak_areas[0].topic} — your weakest topic",
        }

    recommendations = []
    if open_mistakes:
        recommendations.append({
            "label": f"Review {len(open_mistakes)} mistake{'s' if len(open_mistakes) != 1 else ''}",
            "reason": "You have unreviewed incorrect answers from past quizzes.",
        })
    for area in weak_areas[:2]:
        recommendations.append({
            "label": f"Practice {area.topic}",
            "reason": f"Mastery is at {area.mastery_score:.0f}% ({area.label}).",
            "subject": area.subject,
            "topic": area.topic,
        })

    recent_quizzes = []
    for row in completed:
        quiz = row.get("quizzes") or {}
        recent_quizzes.append(RecentQuizItem(
            attempt_id=row["id"],
            title=quiz.get("title", "Quiz"),
            question_count=quiz.get("question_count", 0),
            correct_count=row["correct_count"],
            accuracy=row.get("accuracy"),
            completed_at=row.get("completed_at"),
        ))

    return QuizDashboardResponse(
        overall_mastery=overall_mastery,
        questions_answered=questions_answered,
        accuracy=accuracy,
        topics_mastered=topics_mastered,
        continue_learning=continue_learning,
        weak_areas=weak_areas,
        recommendations=recommendations,
        recent_quizzes=recent_quizzes,
    )
