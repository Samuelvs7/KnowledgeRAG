import asyncio
import random
from collections.abc import Awaitable, Callable
from typing import TypeVar


T = TypeVar("T")


def is_transient_error(exc: Exception) -> bool:
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status in {408, 409, 425, 429, 500, 502, 503, 504}:
        return True

    message = str(exc).lower()
    permanent_markers = (
        "401", "403", "authentication", "authorization", "permission",
        "invalid api key", "validation", "not found", "row-level security",
    )
    if any(marker in message for marker in permanent_markers):
        return False
    return any(marker in message for marker in (
        "timeout", "timed out", "temporarily", "connection", "rate limit",
        "unavailable", "reset by peer", "server error",
    ))


async def with_retry(
    operation: Callable[[], Awaitable[T]],
    *,
    attempts: int,
    timeout_seconds: float,
) -> T:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await asyncio.wait_for(operation(), timeout=timeout_seconds)
        except Exception as exc:
            last_error = exc
            if attempt >= attempts or not is_transient_error(exc):
                raise
            delay = min(8.0, 0.5 * (2 ** (attempt - 1))) + random.uniform(0, 0.25)
            await asyncio.sleep(delay)
    raise RuntimeError("Retry operation ended without a result") from last_error
