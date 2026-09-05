"""AI Tutor service for the Learning platform.

Generates structured, progressive lessons, flashcards, and Socratic tutor chat.
When a source document is provided, content is grounded in that document via the
existing Document RAG retrieval; otherwise the tutor teaches from general knowledge.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from services.ai.router import ModelRouter
from services.retrieval.document_retriever import DocumentRetriever

logger = logging.getLogger(__name__)

_retriever = DocumentRetriever()

LEVEL_GUIDANCE = {
    "beginner": "Assume no prior knowledge. Use plain language, everyday analogies, and short sentences.",
    "intermediate": "Assume basic familiarity. Go deeper into how and why, with a concrete example.",
    "advanced": "Assume solid fundamentals. Focus on nuance, edge cases, trade-offs, and deeper mechanisms.",
}


def _extract_json(raw: str) -> Any:
    """Parse a JSON object/array from an LLM response, tolerating markdown fences."""
    text = (raw or "").strip()
    text = re.sub(r"^```(json)?", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Grab the first {...} or [...] block.
        match = re.search(r"(\{.*\}|\[.*\])", text, flags=re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


async def _grounding_context(topic: str, user_id: str, document_id: Optional[str]) -> str:
    """Retrieve top chunks from the source document to ground the lesson."""
    if not document_id:
        return ""
    try:
        chunks = await _retriever.retrieve(topic, user_id, document_id=document_id)
        chunks = chunks[:8]
        if not chunks:
            return ""
        joined = "\n\n".join(f"[{i + 1}] {c.content}" for i, c in enumerate(chunks))
        return joined
    except Exception:
        logger.exception("[TUTOR] grounding retrieval failed for document %s", document_id)
        return ""


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _coerce_worked_example(value: Any) -> str:
    """Turn a worked example into clean Markdown.

    LLMs often return this as a structured object ({"goal": ..., "steps": [...]})
    or a list of steps. Rendering str(dict) gives an ugly ``{'goal': ...}`` blob,
    so format known shapes as Markdown (goal line + numbered steps) instead.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return "\n".join(f"{i + 1}. {str(step).strip()}" for i, step in enumerate(value) if str(step).strip())
    if isinstance(value, dict):
        parts: list[str] = []
        goal = value.get("goal") or value.get("problem") or value.get("title")
        if goal:
            parts.append(f"**Goal:** {str(goal).strip()}")
        steps = value.get("steps") or value.get("walkthrough")
        if isinstance(steps, list):
            parts.append("\n".join(f"{i + 1}. {str(s).strip()}" for i, s in enumerate(steps) if str(s).strip()))
        elif isinstance(steps, str):
            parts.append(steps.strip())
        code = value.get("code")
        if isinstance(code, str) and code.strip():
            parts.append(f"```\n{code.strip()}\n```")
        result = value.get("result") or value.get("output")
        if result:
            parts.append(f"**Result:** {str(result).strip()}")
        if parts:
            return "\n\n".join(parts)
    return str(value).strip()


def _coerce_diagram(value: Any) -> Optional[dict[str, Any]]:
    """Normalize an LLM diagram spec into {kind, title, nodes:[{label,detail,group}]}.

    Returns None when there is nothing renderable, so the frontend can skip it.
    """
    if not isinstance(value, dict):
        return None
    kind = str(value.get("kind") or value.get("type") or "flow").strip().lower()
    if kind not in {"flow", "tree", "cycle", "compare"}:
        kind = "flow"
    raw_nodes = value.get("nodes") or value.get("steps") or value.get("items") or []
    nodes: list[dict[str, str]] = []
    if isinstance(raw_nodes, list):
        for n in raw_nodes:
            if isinstance(n, dict):
                label = str(n.get("label") or n.get("title") or n.get("name") or n.get("text") or "").strip()
                if not label:
                    continue
                node = {"label": label, "detail": str(n.get("detail") or n.get("description") or "").strip()}
                group = n.get("group") or n.get("side") or n.get("column")
                if group:
                    node["group"] = str(group).strip()
                nodes.append(node)
            elif isinstance(n, str) and n.strip():
                nodes.append({"label": n.strip(), "detail": ""})
    if len(nodes) < 2:
        return None
    return {"kind": kind, "title": str(value.get("title") or "").strip(), "nodes": nodes[:6]}


def _normalize_lesson(data: Any, topic: str, level: str) -> dict[str, Any]:
    """Coerce arbitrary LLM output into the lesson shape the frontend expects."""
    if not isinstance(data, dict):
        return {
            "title": topic,
            "level": level,
            "introduction": str(data) if data else "We couldn't generate this lesson. Please try again.",
            "concepts": [],
            "worked_example": "",
            "key_takeaways": [],
            "common_mistakes": [],
            "next_topics": [],
            "diagram": None,
        }

    concepts_raw = data.get("concepts") or []
    concepts: list[dict[str, str]] = []
    if isinstance(concepts_raw, list):
        for c in concepts_raw:
            if isinstance(c, dict):
                concepts.append({
                    "heading": str(c.get("heading") or c.get("title") or "Concept").strip(),
                    "explanation": str(c.get("explanation") or c.get("detail") or "").strip(),
                    "analogy": str(c.get("analogy") or "").strip(),
                })
            elif isinstance(c, str) and c.strip():
                concepts.append({"heading": "Concept", "explanation": c.strip(), "analogy": ""})

    return {
        "title": str(data.get("title") or topic).strip(),
        "level": level,
        "introduction": str(data.get("introduction") or data.get("intro") or "").strip(),
        "concepts": concepts,
        "worked_example": _coerce_worked_example(data.get("worked_example") or data.get("example")),
        "key_takeaways": _as_list(data.get("key_takeaways") or data.get("takeaways")),
        "common_mistakes": _as_list(data.get("common_mistakes") or data.get("mistakes")),
        "next_topics": _as_list(data.get("next_topics") or data.get("next")),
        "diagram": _coerce_diagram(data.get("diagram") or data.get("visual")),
    }


async def generate_lesson(
    *,
    user_id: str,
    topic: str,
    subject: str,
    level: str,
    document_id: Optional[str] = None,
) -> dict[str, Any]:
    level = level if level in LEVEL_GUIDANCE else "beginner"
    context = await _grounding_context(topic, user_id, document_id)

    schema = (
        'Return ONLY a JSON object (no markdown, no prose) with keys: '
        '"title" (string), "introduction" (2-3 sentence hook), '
        '"concepts" (array of 3-5 objects each with "heading", "explanation" (2-4 sentences), '
        'and "analogy" (a relatable real-world comparison)), '
        '"worked_example" (a concrete step-by-step example, written as a Markdown STRING — '
        'use a numbered list for the steps and include a fenced code block with a language tag '
        'when code makes it clearer; do NOT return an object here), '
        '"key_takeaways" (array of 3-6 short strings), '
        '"common_mistakes" (array of 2-4 short strings), '
        '"next_topics" (array of 2-4 topic names to learn next), '
        '"diagram" (a visual aid that captures the core idea at a glance: an object with '
        '"kind" (choose the BEST fit: "flow" for a process/algorithm with ordered steps, '
        '"cycle" for something that repeats, "tree" for a hierarchy where node 1 is the root '
        'and the rest are its children, "compare" for A-vs-B where each node has a "group"), '
        '"title" (short), and "nodes" (3-6 objects each with a concise "label" and a short '
        '"detail"; for "compare" also give each node a "group" naming which side it belongs to)).'
    )

    if context:
        prompt = (
            f"Teach the topic \"{topic}\" (subject: {subject}) at {level} level, grounded ONLY in the "
            f"source material below. Do not invent facts beyond it.\n\n"
            f"SOURCE MATERIAL:\n{context}\n\n"
            f"{LEVEL_GUIDANCE[level]}\n\n{schema}"
        )
    else:
        prompt = (
            f"Teach the topic \"{topic}\" (subject: {subject}) at {level} level from your own knowledge.\n"
            f"{LEVEL_GUIDANCE[level]}\n\n{schema}"
        )

    provider = ModelRouter.get_provider()
    result = await provider.generate_text(
        prompt,
        system_instruction=(
            "You are an inspiring, patient tutor who makes hard topics feel easy and exciting. "
            "You always output strictly valid JSON, never markdown fences, never commentary."
        ),
    )
    lesson = _normalize_lesson(_extract_json(result.text), topic, level)
    lesson["grounded"] = bool(context)
    return lesson


async def generate_flashcards(
    *,
    user_id: str,
    topic: str,
    count: int = 8,
    document_id: Optional[str] = None,
) -> list[dict[str, str]]:
    count = max(3, min(20, count))
    context = await _grounding_context(topic, user_id, document_id)

    schema = (
        f'Return ONLY a JSON array of exactly {count} objects, each with "front" (a question or term) '
        'and "back" (a clear, concise answer). No markdown, no prose.'
    )
    if context:
        prompt = (
            f"Create {count} study flashcards for the topic \"{topic}\", grounded ONLY in this material:\n\n"
            f"{context}\n\n{schema}"
        )
    else:
        prompt = f"Create {count} study flashcards for the topic \"{topic}\" from your own knowledge.\n\n{schema}"

    provider = ModelRouter.get_provider()
    result = await provider.generate_text(
        prompt,
        system_instruction="You generate study flashcards as strictly valid JSON. Never use markdown fences.",
    )
    data = _extract_json(result.text)
    cards: list[dict[str, str]] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and (item.get("front") or item.get("back")):
                cards.append({
                    "front": str(item.get("front") or "").strip(),
                    "back": str(item.get("back") or "").strip(),
                })
    return cards[:count]


async def tutor_chat(
    *,
    user_id: str,
    query: str,
    history: Optional[list[dict[str, Any]]] = None,
    topic: Optional[str] = None,
    document_id: Optional[str] = None,
) -> str:
    context = await _grounding_context(query if not topic else f"{topic}: {query}", user_id, document_id)

    history_text = ""
    if history:
        history_text = "Conversation so far:\n" + "\n".join(
            f"{m.get('role', 'user').capitalize()}: {m.get('content', '')}" for m in history[-6:]
        ) + "\n\n"

    grounding = f"Relevant material from the learner's document:\n{context}\n\n" if context else ""
    topic_line = f"Current topic: {topic}\n" if topic else ""

    prompt = (
        f"{history_text}{grounding}{topic_line}"
        f"The learner asks: {query}\n\n"
        "Answer as their tutor. Be clear and encouraging, use a short example or analogy when it helps, "
        "and end with a gentle check-for-understanding question when appropriate. "
        "If the material above is relevant, ground your answer in it."
    )

    provider = ModelRouter.get_provider()
    result = await provider.generate_text(
        prompt,
        system_instruction=(
            "You are a warm, encouraging personal tutor. You explain simply, never condescend, "
            "and keep the learner motivated. Prefer clarity over length.\n\n"
            "Format your reply as clean Markdown so it is easy to read: use short **bold** lead-ins, "
            "bullet lists for steps or comparisons, and fenced code blocks with a language tag for any "
            "code or formulas. Avoid one long unbroken paragraph."
        ),
    )
    return result.text.strip()
