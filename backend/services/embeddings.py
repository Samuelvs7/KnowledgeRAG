import asyncio
import logging
import time
import traceback
from typing import Any

from google import genai
from google.genai import types

from config import settings
from services.retry import is_transient_error, with_retry


logger = logging.getLogger(__name__)

logger.info("[STEP] embeddings.gemini_client")
logger.info("[START] Initializing shared Gemini embedding client")
try:
    client = genai.Client(api_key=settings.gemini_api_key)
except Exception:
    logger.exception("[FAILED] Shared Gemini embedding client initialization failed")
    traceback.print_exc()
    raise
logger.info("[SUCCESS] Shared Gemini embedding client initialized")


async def embed_text(text: str, *, title: str | None = None, is_query: bool = False) -> list[float]:
    async def operation() -> list[float]:
        return await asyncio.to_thread(_embed_text_sync, text, title, is_query)

    logger.info("[STEP] embeddings.embed_text text_chars=%s is_query=%s", len(text or ""), is_query)
    logger.info("[START] Shared embedding generation model=%s dimensions=%s", settings.embedding_model, settings.embedding_dimensions)
    try:
        embedding = await with_retry(
            operation,
            attempts=settings.max_retry_attempts,
            timeout_seconds=settings.embedding_timeout_seconds,
        )
    except Exception:
        logger.exception("[FAILED] Shared embedding generation failed")
        traceback.print_exc()
        raise
    logger.info("[SUCCESS] Shared embedding generated length=%s", len(embedding))
    return embedding


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
    logger.info(
        "[START] Calling shared Gemini embed_content model=%s dimensions=%s prepared_chars=%s",
        settings.embedding_model,
        settings.embedding_dimensions,
        len(prepared),
    )
    try:
        result = client.models.embed_content(
            model=settings.embedding_model,
            contents=prepared,
            config=types.EmbedContentConfig(output_dimensionality=settings.embedding_dimensions),
        )
    except Exception:
        logger.exception("[FAILED] Shared Gemini embed_content call failed")
        traceback.print_exc()
        raise
    embedding = _extract_embedding_values(result)
    if len(embedding) != settings.embedding_dimensions:
        logger.error(
            "[FAILED] Shared embedding dimension mismatch expected=%s got=%s",
            settings.embedding_dimensions,
            len(embedding),
        )
        raise ValueError(
            f"Embedding dimension mismatch: expected {settings.embedding_dimensions}, got {len(embedding)}"
        )
    logger.info("[SUCCESS] Shared Gemini embed_content returned embedding_length=%s", len(embedding))
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
