import asyncio
import time
from typing import Any

from google import genai
from google.genai import types

from config import settings
from services.retry import is_transient_error, with_retry


client = genai.Client(api_key=settings.gemini_api_key)


async def embed_text(text: str, *, title: str | None = None, is_query: bool = False) -> list[float]:
    async def operation() -> list[float]:
        return await asyncio.to_thread(_embed_text_sync, text, title, is_query)

    return await with_retry(
        operation,
        attempts=settings.max_retry_attempts,
        timeout_seconds=settings.embedding_timeout_seconds,
    )


async def embed_texts(texts: list[str], *, title: str | None = None) -> list[list[float]]:
    semaphore = asyncio.Semaphore(settings.embedding_concurrency)

    async def embed_one(text: str) -> list[float]:
        async with semaphore:
            return await embed_text(text, title=title, is_query=False)

    return await asyncio.gather(*(embed_one(text) for text in texts))


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Compatibility wrapper for synchronous product/indexing callers."""
    return [_embed_with_sync_retry(text, None, False) for text in texts]

def get_query_embedding(query: str) -> list[float]:
    return _embed_with_sync_retry(query, None, True)


def _embed_with_sync_retry(text: str, title: str | None, is_query: bool) -> list[float]:
    last_error: Exception | None = None
    for attempt in range(1, settings.max_retry_attempts + 1):
        try:
            return _embed_text_sync(text, title, is_query)
        except Exception as exc:
            last_error = exc
            if attempt >= settings.max_retry_attempts or not is_transient_error(exc):
                raise
            time.sleep(min(8.0, 0.5 * (2 ** (attempt - 1))))
    raise RuntimeError("Embedding call ended without a result") from last_error


def _embed_text_sync(text: str, title: str | None, is_query: bool) -> list[float]:
    prepared = _prepare_embedding_text(text, title=title, is_query=is_query)
    result = client.models.embed_content(
        model=settings.embedding_model,
        contents=prepared,
        config=types.EmbedContentConfig(output_dimensionality=settings.embedding_dimensions),
    )
    embedding = _extract_embedding_values(result)
    if len(embedding) != settings.embedding_dimensions:
        raise ValueError(
            f"Embedding dimension mismatch: expected {settings.embedding_dimensions}, got {len(embedding)}"
        )
    return embedding


def _prepare_embedding_text(text: str, *, title: str | None, is_query: bool) -> str:
    cleaned = " ".join((text or "").split())
    if is_query:
        return f"task: question answering | query: {cleaned}"
    prefix = f"title: {title or 'Untitled'} | " if title else ""
    return f"task: document retrieval | {prefix}text: {cleaned}"


def _extract_embedding_values(result: Any) -> list[float]:
    embeddings = getattr(result, "embeddings", None)
    if embeddings is None and isinstance(result, dict):
        embeddings = result.get("embeddings") or result.get("embedding")
    if not embeddings:
        raise ValueError("Gemini embedding response did not include embeddings")

    first = embeddings[0] if isinstance(embeddings, list) else embeddings
    values = getattr(first, "values", None)
    if values is None and isinstance(first, dict):
        values = first.get("values") or first.get("embedding")
    if values is None:
        raise ValueError("Gemini embedding response did not include values")
    return [float(value) for value in values]
