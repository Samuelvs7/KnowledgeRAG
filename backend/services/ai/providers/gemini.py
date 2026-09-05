import asyncio
import logging
import queue
import random
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
            "[START] Initializing Gemini client llm_model=%s embedding_provider=%s",
            settings.llm_model,
            settings.embedding_provider,
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
            attempts = max(1, settings.max_retry_attempts)
            for attempt in range(1, attempts + 1):
                produced = False
                try:
                    stream = self._generate_stream(prompt, system_instruction)
                    for event in stream:
                        delta = self._event_text(event)
                        if delta:
                            produced = True
                            events.put(("delta", delta))
                    events.put(("done", None))
                    return
                except Exception as exc:
                    # Only retry when the failure happened before any text was emitted;
                    # retrying mid-stream would duplicate the already-sent output.
                    if produced or attempt >= attempts or not is_transient_error(exc):
                        events.put(("error", exc))
                        return
                    delay = min(8.0, 0.5 * (2 ** (attempt - 1))) + random.uniform(0, 0.25)
                    logger.warning(
                        "[GEMINI] stream attempt %d/%d failed (%s); retrying in %.1fs",
                        attempt, attempts, exc, delay,
                    )
                    time.sleep(delay)

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
