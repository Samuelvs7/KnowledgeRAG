import asyncio
import logging
import queue
import threading
import time
import traceback
from collections.abc import AsyncIterator
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from google import genai
from google.genai import types

from config import settings
from services.ai.providers.base import BaseProvider, LLMResult
from services.retry import is_transient_error, with_retry

logger = logging.getLogger(__name__)


def _package_version(package_name: str) -> str:
    try:
        return version(package_name)
    except PackageNotFoundError:
        return "not-installed"


class GeminiProvider(BaseProvider):
    def __init__(self):
        logger.info("[STEP] gemini.initialization")
        logger.info(
            "[START] Initializing Gemini client llm_model=%s embedding_model=%s embedding_dimensions=%s",
            settings.llm_model,
            settings.embedding_model,
            settings.embedding_dimensions,
        )
        try:
            self.client = genai.Client(api_key=settings.gemini_api_key)
        except Exception:
            logger.exception("[FAILED] Gemini client initialization failed")
            traceback.print_exc()
            raise
        logger.info(
            "[SUCCESS] Gemini client initialized sdk_version=%s package_version=%s",
            getattr(genai, "__version__", "unknown"),
            _package_version("google-genai"),
        )

    async def generate_text(self, prompt: str, *, system_instruction: str | None = None) -> LLMResult:
        async def operation() -> Any:
            return await asyncio.to_thread(self._generate_content, prompt, system_instruction)

        response = await with_retry(
            operation,
            attempts=settings.max_retry_attempts,
            timeout_seconds=settings.llm_timeout_seconds,
        )
        return self._result_from_response(response)

    async def stream_text(self, prompt: str, *, system_instruction: str | None = None) -> AsyncIterator[str]:
        events: queue.Queue[tuple[str, str | Exception | None]] = queue.Queue()

        def worker() -> None:
            try:
                stream = self._generate_stream(prompt, system_instruction)
                for event in stream:
                    delta = self._event_text(event)
                    if delta:
                        events.put(("delta", delta))
                events.put(("done", None))
            except Exception as exc:
                events.put(("error", exc))

        thread = threading.Thread(target=worker, name="gemini-stream", daemon=True)
        thread.start()

        while True:
            event_type, payload = await asyncio.to_thread(events.get)
            if event_type == "delta":
                yield str(payload or "")
            elif event_type == "error":
                raise payload if isinstance(payload, Exception) else RuntimeError("LLM stream failed")
            else:
                break

    async def embed_text(self, text: str, *, title: str | None = None, is_query: bool = False) -> list[float]:
        logger.info(
            "[STEP] gemini.embedding text_chars=%s title_present=%s is_query=%s",
            len(text or ""),
            bool(title),
            is_query,
        )
        logger.info(
            "[START] Generating Gemini embedding model=%s dimensions=%s",
            settings.embedding_model,
            settings.embedding_dimensions,
        )
        async def operation() -> list[float]:
            return await asyncio.to_thread(self._embed_text_sync, text, title, is_query)

        try:
            embedding = await with_retry(
                operation,
                attempts=settings.max_retry_attempts,
                timeout_seconds=settings.embedding_timeout_seconds,
            )
        except Exception:
            logger.exception("[FAILED] Gemini embedding generation failed")
            traceback.print_exc()
            raise
        logger.info("[SUCCESS] Gemini embedding generated length=%s", len(embedding))
        return embedding

    def _generate_content(self, prompt: str, system_instruction: str | None) -> Any:
        config = types.GenerateContentConfig(
            temperature=0.2,
            system_instruction=system_instruction,
        )
        return self.client.models.generate_content(
            model=settings.llm_model,
            contents=prompt,
            config=config,
        )

    def _generate_stream(self, prompt: str, system_instruction: str | None) -> Any:
        config = types.GenerateContentConfig(
            temperature=0.2,
            system_instruction=system_instruction,
        )
        return self.client.models.generate_content_stream(
            model=settings.llm_model,
            contents=prompt,
            config=config,
        )

    def _result_from_response(self, response: Any) -> LLMResult:
        usage = getattr(response, "usage_metadata", None) or getattr(response, "usage", None)
        return LLMResult(
            text=self._response_text(response).strip(),
            prompt_tokens=self._usage_value(usage, "prompt_token_count", "input_tokens"),
            completion_tokens=self._usage_value(usage, "candidates_token_count", "output_tokens"),
        )

    def _response_text(self, response: Any) -> str:
        for attr in ("output_text", "text"):
            value = getattr(response, attr, None)
            if value:
                return str(value)

        candidates = getattr(response, "candidates", None) or []
        parts: list[str] = []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            for part in getattr(content, "parts", None) or []:
                text = getattr(part, "text", None)
                if text:
                    parts.append(str(text))
        return "".join(parts)

    def _event_text(self, event: Any) -> str:
        if getattr(event, "event_type", None) == "step.delta":
            delta = getattr(event, "delta", None)
            if getattr(delta, "type", None) == "text":
                return str(getattr(delta, "text", "") or "")

        for attr in ("text", "output_text"):
            value = getattr(event, attr, None)
            if value:
                return str(value)
        return ""

    def _usage_value(self, usage: Any, *names: str) -> int:
        if not usage:
            return 0
        for name in names:
            value = getattr(usage, name, None)
            if value is not None:
                return int(value or 0)
            if isinstance(usage, dict) and name in usage:
                return int(usage.get(name) or 0)
        return 0

    def _embed_text_sync(self, text: str, title: str | None, is_query: bool) -> list[float]:
        prepared = self._prepare_embedding_text(text, title=title, is_query=is_query)
        logger.info(
            "[START] Calling Gemini embed_content model=%s dimensions=%s prepared_chars=%s",
            settings.embedding_model,
            settings.embedding_dimensions,
            len(prepared),
        )
        try:
            result = self.client.models.embed_content(
                model=settings.embedding_model,
                contents=prepared,
                config=types.EmbedContentConfig(output_dimensionality=settings.embedding_dimensions),
            )
        except Exception:
            logger.exception("[FAILED] Gemini embed_content call failed")
            traceback.print_exc()
            raise
        embedding = self._extract_embedding_values(result)
        if len(embedding) != settings.embedding_dimensions:
            logger.error(
                "[FAILED] Embedding dimension mismatch expected=%s got=%s",
                settings.embedding_dimensions,
                len(embedding),
            )
            raise ValueError(
                f"Embedding dimension mismatch: expected {settings.embedding_dimensions}, got {len(embedding)}"
            )
        logger.info("[SUCCESS] Gemini embed_content returned embedding_length=%s", len(embedding))
        return embedding

    def _prepare_embedding_text(self, text: str, *, title: str | None, is_query: bool) -> str:
        cleaned = " ".join((text or "").split())
        if is_query:
            return f"task: question answering | query: {cleaned}"
        prefix = f"title: {title or 'Untitled'} | " if title else ""
        return f"task: document retrieval | {prefix}text: {cleaned}"

    def _extract_embedding_values(self, result: Any) -> list[float]:
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
