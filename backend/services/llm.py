import asyncio
import queue
import threading
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import types

from config import settings
from services.retry import is_transient_error, with_retry


client = genai.Client(api_key=settings.gemini_api_key)


@dataclass(frozen=True)
class LLMResult:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0


async def generate_text(prompt: str, *, system_instruction: str | None = None) -> LLMResult:
    async def operation() -> Any:
        return await asyncio.to_thread(_generate_content, prompt, system_instruction)

    response = await with_retry(
        operation,
        attempts=settings.max_retry_attempts,
        timeout_seconds=settings.llm_timeout_seconds,
    )
    return _result_from_response(response)


def generate_text_sync(prompt: str, *, system_instruction: str | None = None) -> LLMResult:
    last_error: Exception | None = None
    for attempt in range(1, settings.max_retry_attempts + 1):
        try:
            response = _generate_content(prompt, system_instruction)
            return _result_from_response(response)
        except Exception as exc:
            last_error = exc
            if attempt >= settings.max_retry_attempts or not is_transient_error(exc):
                raise
            time.sleep(min(8.0, 0.5 * (2 ** (attempt - 1))))
    raise RuntimeError("LLM call ended without a result") from last_error


async def stream_text(prompt: str, *, system_instruction: str | None = None) -> AsyncIterator[str]:
    events: queue.Queue[tuple[str, str | Exception | None]] = queue.Queue()

    def worker() -> None:
        try:
            stream = _generate_stream(prompt, system_instruction)
            for event in stream:
                delta = _event_text(event)
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


def _generate_content(prompt: str, system_instruction: str | None) -> Any:
    config = types.GenerateContentConfig(
        temperature=0.2,
        system_instruction=system_instruction,
    )
    return client.models.generate_content(
        model=settings.llm_model,
        contents=prompt,
        config=config,
    )


def _generate_stream(prompt: str, system_instruction: str | None) -> Any:
    config = types.GenerateContentConfig(
        temperature=0.2,
        system_instruction=system_instruction,
    )
    return client.models.generate_content_stream(
        model=settings.llm_model,
        contents=prompt,
        config=config,
    )


def _result_from_response(response: Any) -> LLMResult:
    usage = getattr(response, "usage_metadata", None) or getattr(response, "usage", None)
    return LLMResult(
        text=_response_text(response).strip(),
        prompt_tokens=_usage_value(usage, "prompt_token_count", "input_tokens"),
        completion_tokens=_usage_value(usage, "candidates_token_count", "output_tokens"),
    )


def _response_text(response: Any) -> str:
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


def _event_text(event: Any) -> str:
    if getattr(event, "event_type", None) == "step.delta":
        delta = getattr(event, "delta", None)
        if getattr(delta, "type", None) == "text":
            return str(getattr(delta, "text", "") or "")

    for attr in ("text", "output_text"):
        value = getattr(event, attr, None)
        if value:
            return str(value)
    return ""


def _usage_value(usage: Any, *names: str) -> int:
    if not usage:
        return 0
    for name in names:
        value = getattr(usage, name, None)
        if value is not None:
            return int(value or 0)
        if isinstance(usage, dict) and name in usage:
            return int(usage.get(name) or 0)
    return 0
