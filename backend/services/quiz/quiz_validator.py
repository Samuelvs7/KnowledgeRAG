"""Structural validation for AI-generated quiz questions.

Malformed questions must never reach a student, so every question produced
by QuizGenerator is checked here before persistence; failures cause a
bounded regeneration retry in the caller.
"""
from __future__ import annotations

import re
from typing import Any

REQUIRED_FIELDS = ("question", "options", "correct_answer", "explanation")


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def validate_question(question: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    for field in REQUIRED_FIELDS:
        if not question.get(field):
            errors.append(f"missing field: {field}")
    if errors:
        return errors

    options = question.get("options")
    if not isinstance(options, list) or len(options) != 4:
        errors.append("must have exactly 4 options")
        return errors

    if any(not isinstance(o, str) or not o.strip() for o in options):
        errors.append("options must be non-empty strings")
        return errors

    normalized_options = [_normalize(o) for o in options]
    if len(set(normalized_options)) != 4:
        errors.append("options must not contain duplicates")

    correct_answer = str(question.get("correct_answer", ""))
    matches = [o for o in options if _normalize(o) == _normalize(correct_answer)]
    if len(matches) != 1:
        errors.append("correct_answer must match exactly one option")

    hint = question.get("hint")
    if hint and correct_answer and _normalize(correct_answer) in _normalize(hint):
        errors.append("hint must not reveal the answer")

    explanation = question.get("explanation", "")
    if len(explanation.strip()) < 10:
        errors.append("explanation is too short to be useful")

    return errors


def is_duplicate(question_text: str, existing_texts: list[str]) -> bool:
    normalized = _normalize(question_text)
    return any(normalized == _normalize(existing) for existing in existing_texts)
