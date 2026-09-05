"""Quiz generation: retrieve context (when document-grounded), prompt the
configured LLM for strict-JSON questions, validate/regenerate malformed
output, and persist the resulting quiz + questions.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from typing import Any

from database import supabase
from services.ai.router import ModelRouter
from services.quiz.quiz_validator import is_duplicate, validate_question

logger = logging.getLogger(__name__)

MAX_GENERATION_ROUNDS = 3
CHUNKS_PER_DOCUMENT = 24


class QuizGenerationError(Exception):
    pass


async def generate_quiz(
    *,
    user_id: str,
    subject: str,
    topic: str,
    difficulty: str,
    question_count: int,
    source: str,
    mode: str = "practice",
    document_id: str | None = None,
) -> dict[str, Any]:
    context_chunks: list[dict[str, Any]] = []
    if document_id:
        context_chunks = await asyncio.to_thread(_fetch_document_chunks, user_id, document_id)
        if not context_chunks:
            raise QuizGenerationError("Selected document has no indexed content yet")

    existing_texts = await asyncio.to_thread(_fetch_existing_question_texts, user_id, topic)

    accepted: list[dict[str, Any]] = []
    remaining = question_count
    for _round in range(MAX_GENERATION_ROUNDS):
        if remaining <= 0:
            break
        prompt = _build_prompt(
            subject=subject,
            topic=topic,
            difficulty=difficulty,
            question_count=remaining,
            context_chunks=context_chunks,
        )
        try:
            provider = ModelRouter.get_provider()
            result = await provider.generate_text(
                prompt,
                system_instruction=(
                    "You are a quiz-question generator for an educational platform. "
                    "You output only valid JSON, never prose, never markdown fences."
                ),
            )
        except Exception:
            logger.exception("[FAILED] quiz_generator.llm_call round=%s", _round)
            continue

        candidates = _parse_questions(result.text)
        for candidate in candidates:
            errors = validate_question(candidate)
            if errors:
                logger.info("[SKIP] quiz_generator.invalid_question errors=%s", errors)
                continue
            question_text = str(candidate["question"])
            if is_duplicate(question_text, existing_texts) or is_duplicate(
                question_text, [c["question_text"] for c in accepted]
            ):
                continue
            accepted.append(_to_persisted_shape(candidate, subject, topic, difficulty, context_chunks))
            if len(accepted) >= question_count:
                break
        remaining = question_count - len(accepted)

    if not accepted:
        raise QuizGenerationError("Could not generate valid questions for this topic")

    quiz_row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": f"{topic} Quiz",
        "subject": subject,
        "topic": topic,
        "difficulty": difficulty,
        "mode": mode,
        "source": source,
        "source_document_id": document_id,
        "question_count": len(accepted),
        "status": "ready",
    }
    await asyncio.to_thread(lambda: supabase.table("quizzes").insert(quiz_row).execute())

    question_rows = []
    for index, question in enumerate(accepted):
        row = dict(question)
        row["id"] = str(uuid.uuid4())
        row["quiz_id"] = quiz_row["id"]
        row["order_index"] = index
        question_rows.append(row)
    await asyncio.to_thread(lambda: supabase.table("quiz_questions").insert(question_rows).execute())

    return {"quiz": quiz_row, "questions": question_rows}


def _fetch_document_chunks(user_id: str, document_id: str) -> list[dict[str, Any]]:
    doc_resp = (
        supabase.table("documents")
        .select("id")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not doc_resp.data:
        raise QuizGenerationError("Document not found")

    chunk_resp = (
        supabase.table("document_chunks")
        .select("id, document_id, content, chunk_index, metadata")
        .eq("document_id", document_id)
        .order("chunk_index")
        .limit(200)
        .execute()
    )
    chunks = chunk_resp.data or []
    if len(chunks) <= CHUNKS_PER_DOCUMENT:
        return chunks
    step = max(1, len(chunks) // CHUNKS_PER_DOCUMENT)
    return chunks[::step][:CHUNKS_PER_DOCUMENT]


def _fetch_existing_question_texts(user_id: str, topic: str) -> list[str]:
    quiz_resp = (
        supabase.table("quizzes")
        .select("id")
        .eq("user_id", user_id)
        .eq("topic", topic)
        .limit(50)
        .execute()
    )
    quiz_ids = [row["id"] for row in (quiz_resp.data or [])]
    if not quiz_ids:
        return []
    q_resp = (
        supabase.table("quiz_questions")
        .select("question_text")
        .in_("quiz_id", quiz_ids)
        .limit(500)
        .execute()
    )
    return [row["question_text"] for row in (q_resp.data or [])]


def _build_prompt(
    *,
    subject: str,
    topic: str,
    difficulty: str,
    question_count: int,
    context_chunks: list[dict[str, Any]],
) -> str:
    schema_instructions = (
        'Return a JSON array of exactly {n} objects, each with keys: '
        '"question" (string), "options" (array of exactly 4 distinct strings), '
        '"correct_answer" (string, must exactly match one of the options), '
        '"explanation" (string, 1-3 sentences explaining why the answer is correct), '
        '"hint" (string, helps reasoning without revealing the answer){source_field}. '
        "Every question must have exactly one unambiguously correct option and three "
        "plausible, clearly-wrong distractors. Output only the JSON array, nothing else."
    )

    if context_chunks:
        sections = []
        for index, chunk in enumerate(context_chunks, start=1):
            sections.append(f"[{index}] {chunk['content']}")
        context_text = "\n\n".join(sections)
        instructions = schema_instructions.format(
            n=question_count,
            source_field=', "source_index" (integer, the bracketed [n] number of the '
            "source passage this question is grounded in)",
        )
        return (
            "Generate quiz questions grounded ONLY in the source material below. "
            "Do not introduce facts that are not supported by the source material. "
            f"Subject: {subject} | Topic: {topic} | Difficulty: {difficulty}\n\n"
            f"Source material:\n{context_text}\n\n"
            f"{instructions}"
        )

    instructions = schema_instructions.format(n=question_count, source_field="")
    return (
        f"Generate {question_count} quiz questions on the topic below, from your own "
        "general knowledge, at the requested difficulty.\n"
        f"Subject: {subject} | Topic: {topic} | Difficulty: {difficulty}\n\n"
        f"{instructions}"
    )


def _parse_questions(raw_text: str) -> list[dict[str, Any]]:
    text = raw_text.strip()
    text = re.sub(r"^```(json)?", "", text.strip(), flags=re.IGNORECASE).strip()
    text = re.sub(r"```$", "", text.strip()).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", text, flags=re.DOTALL)
        if not match:
            return []
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []

    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


def _to_persisted_shape(
    candidate: dict[str, Any],
    subject: str,
    topic: str,
    difficulty: str,
    context_chunks: list[dict[str, Any]],
) -> dict[str, Any]:
    source_chunk_id = None
    source_document_id = None
    source_excerpt = None
    if context_chunks:
        source_index = candidate.get("source_index")
        try:
            chunk = context_chunks[int(source_index) - 1] if source_index else context_chunks[0]
        except (TypeError, ValueError, IndexError):
            chunk = context_chunks[0]
        source_chunk_id = chunk.get("id")
        source_document_id = chunk.get("document_id")
        source_excerpt = (chunk.get("content") or "")[:280]

    return {
        "question_text": str(candidate["question"]).strip(),
        "options": candidate["options"],
        "correct_answer": str(candidate["correct_answer"]).strip(),
        "explanation": str(candidate["explanation"]).strip(),
        "hint": str(candidate.get("hint") or "").strip() or None,
        "topic": candidate.get("topic") or topic,
        "subject": subject,
        "difficulty": difficulty,
        "source_document_id": source_document_id,
        "source_chunk_id": source_chunk_id,
        "source_excerpt": source_excerpt,
    }
