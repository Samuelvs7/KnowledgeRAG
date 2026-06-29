import re
from typing import Any


def rerank_matches(matches: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    query_terms = _terms(query)
    if not query_terms:
        return matches

    ranked = []
    for index, match in enumerate(matches):
        content_terms = _terms(str(match.get("content") or ""))
        overlap = len(query_terms & content_terms) / max(len(query_terms), 1)
        similarity = float(match.get("similarity") or 0)
        score = (similarity * 0.75) + (overlap * 0.25)
        enriched = dict(match)
        enriched["rerank_score"] = round(score, 6)
        ranked.append((score, similarity, -index, enriched))

    ranked.sort(reverse=True)
    return [item[-1] for item in ranked]


def _terms(text: str) -> set[str]:
    return {
        term
        for term in re.findall(r"[a-z0-9]{3,}", text.lower())
        if term not in {"the", "and", "for", "with", "from", "that", "this", "are", "was", "were", "not"}
    }
