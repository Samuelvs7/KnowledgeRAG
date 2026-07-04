import logging
from typing import Any

logger = logging.getLogger(__name__)

_cross_encoder = None

def get_cross_encoder():
    global _cross_encoder
    if _cross_encoder is None:
        try:
            from sentence_transformers import CrossEncoder
            _cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
            logger.info("[SUCCESS] Loaded CrossEncoder: cross-encoder/ms-marco-MiniLM-L-6-v2")
        except ImportError:
            logger.warning("[RERANKER] sentence-transformers not found. Re-ranking will use similarity.")
            _cross_encoder = "mock"
    return _cross_encoder

async def async_rerank_matches(matches: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    import asyncio
    return await asyncio.to_thread(rerank_matches, matches, query)

def rerank_matches(matches: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    if not matches:
        return matches

    encoder = get_cross_encoder()
    if encoder == "mock" or encoder is None:
        logger.info("[RERANKER] Using fallback sorting logic")
        return sorted(matches, key=lambda m: float(m.get("similarity") or m.get("score") or 0.0), reverse=True)
    
    pairs = [(query, str(m.get("content") or "")) for m in matches]
    scores = encoder.predict(pairs)
    
    ranked = []
    for index, (match, score) in enumerate(zip(matches, scores)):
        enriched = dict(match)
        enriched["rerank_score"] = float(score)
        ranked.append((float(score), -index, enriched))
        
    ranked.sort(reverse=True)
    return [item[-1] for item in ranked]

def _terms(text: str) -> set[str]:
    import re
    return {
        term
        for term in re.findall(r"[a-z0-9]{3,}", text.lower())
        if term not in {"the", "and", "for", "with", "from", "that", "this", "are", "was", "were", "not"}
    }
