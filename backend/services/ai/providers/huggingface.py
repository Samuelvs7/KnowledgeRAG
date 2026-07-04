import asyncio
import logging
import math
import time
from typing import Any

import httpx

from config import settings
from services.retry import is_transient_error, with_retry


logger = logging.getLogger(__name__)


class HuggingFaceEmbeddingError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class HuggingFaceEmbeddingProvider:
    """Hugging Face feature-extraction provider behind the shared embedding interface."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str = "BAAI/bge-small-en-v1.5",
        target_dimensions: int = 768,
        timeout_seconds: float | None = None,
        max_retry_attempts: int | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.api_key = api_key or settings.huggingface_api_key
        if not self.api_key:
            raise ValueError("HUGGINGFACE_API_KEY is required for Hugging Face embeddings")
        self.model = model
        self.target_dimensions = target_dimensions
        self.timeout_seconds = timeout_seconds or settings.embedding_timeout_seconds
        self.max_retry_attempts = max_retry_attempts or settings.max_retry_attempts
        self.transport = transport
        self.endpoint = (
            "https://router.huggingface.co/hf-inference/models/"
            f"{self.model}"
        )

    async def embed_text(
        self,
        text: str,
        *,
        title: str | None = None,
        is_query: bool = False,
    ) -> list[float]:
        started = time.perf_counter()

        async def operation() -> list[float]:
            return await asyncio.to_thread(
                self._request_embedding,
                text,
                title,
                is_query,
            )

        try:
            return await with_retry(
                operation,
                attempts=self.max_retry_attempts,
                timeout_seconds=self.timeout_seconds,
            )
        except Exception:
            logger.exception(
                "[FAILED] Hugging Face embedding failed model=%s dimensions=%s",
                self.model,
                self.target_dimensions,
            )
            raise
        finally:
            logger.info(
                "[METRIC] Hugging Face embedding total model=%s dimensions=%s embedding_time_ms=%s",
                self.model,
                self.target_dimensions,
                int((time.perf_counter() - started) * 1000),
            )

    def embed_text_sync(
        self,
        text: str,
        *,
        title: str | None = None,
        is_query: bool = False,
    ) -> list[float]:
        started = time.perf_counter()
        last_error: Exception | None = None
        try:
            for attempt in range(1, self.max_retry_attempts + 1):
                try:
                    return self._request_embedding(text, title, is_query)
                except Exception as exc:
                    last_error = exc
                    if attempt >= self.max_retry_attempts or not is_transient_error(exc):
                        raise
                    delay = min(8.0, 0.5 * (2 ** (attempt - 1)))
                    logger.warning(
                        "[RETRY] Hugging Face embedding transient failure model=%s attempt=%s/%s delay_seconds=%.1f",
                        self.model,
                        attempt,
                        self.max_retry_attempts,
                        delay,
                        exc_info=True,
                    )
                    time.sleep(delay)
        except Exception:
            logger.exception(
                "[FAILED] Hugging Face embedding failed model=%s dimensions=%s",
                self.model,
                self.target_dimensions,
            )
            raise
        finally:
            logger.info(
                "[METRIC] Hugging Face embedding total model=%s dimensions=%s embedding_time_ms=%s",
                self.model,
                self.target_dimensions,
                int((time.perf_counter() - started) * 1000),
            )
        raise RuntimeError("Hugging Face embedding call ended without a result") from last_error

    def _request_embedding(
        self,
        text: str,
        title: str | None,
        is_query: bool,
    ) -> list[float]:
        prepared = self._prepare_text(text, title=title, is_query=is_query)
        logger.info(
            "[REQUEST] Hugging Face embedding model=%s dimensions=%s prepared_chars=%s is_query=%s",
            self.model,
            self.target_dimensions,
            len(prepared),
            is_query,
        )
        timeout = httpx.Timeout(
            self.timeout_seconds,
            connect=min(10.0, self.timeout_seconds),
            read=self.timeout_seconds,
            write=min(10.0, self.timeout_seconds),
            pool=min(10.0, self.timeout_seconds),
        )
        try:
            with httpx.Client(timeout=timeout, transport=self.transport) as client:
                response = client.post(
                    self.endpoint,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "inputs": [prepared],
                        "normalize": True,
                        "truncate": True,
                    },
                )
            if response.is_error:
                raise self._response_error(response)
            vector = self._extract_vector(response.json())
            adapted = self._adapt_dimensions(vector)
            logger.info(
                "[SUCCESS] Hugging Face embedding returned model=%s native_dimensions=%s dimensions=%s",
                self.model,
                len(vector),
                len(adapted),
            )
            return adapted
        except HuggingFaceEmbeddingError:
            raise
        except httpx.TimeoutException as exc:
            raise HuggingFaceEmbeddingError(
                f"Hugging Face embedding request timed out after {self.timeout_seconds:g} seconds"
            ) from exc
        except httpx.TransportError as exc:
            raise HuggingFaceEmbeddingError(
                f"Hugging Face embedding connection failed: {exc}"
            ) from exc
        except (TypeError, ValueError) as exc:
            raise HuggingFaceEmbeddingError(
                f"Hugging Face returned an invalid embedding response: {exc}"
            ) from exc

    @staticmethod
    def _prepare_text(text: str, *, title: str | None, is_query: bool) -> str:
        cleaned = " ".join((text or "").split())
        if not cleaned:
            raise ValueError("Cannot embed empty text")
        if is_query:
            return f"Represent this sentence for searching relevant passages: {cleaned}"
        if title:
            return f"{title}: {cleaned}"
        return cleaned

    @staticmethod
    def _extract_vector(payload: Any) -> list[float]:
        if isinstance(payload, dict):
            if payload.get("error"):
                raise ValueError(str(payload["error"]))
            payload = payload.get("embedding") or payload.get("embeddings")

        while isinstance(payload, list) and len(payload) == 1 and isinstance(payload[0], list):
            payload = payload[0]

        if not isinstance(payload, list) or not payload:
            raise ValueError("response did not contain an embedding vector")
        if all(isinstance(value, (int, float)) for value in payload):
            return [float(value) for value in payload]

        if all(
            isinstance(row, list)
            and row
            and all(isinstance(value, (int, float)) for value in row)
            for row in payload
        ):
            width = len(payload[0])
            if any(len(row) != width for row in payload):
                raise ValueError("token embedding rows have inconsistent dimensions")
            return [
                sum(float(row[index]) for row in payload) / len(payload)
                for index in range(width)
            ]
        raise ValueError("response embedding shape is unsupported")

    def _adapt_dimensions(self, vector: list[float]) -> list[float]:
        if len(vector) > self.target_dimensions:
            raise ValueError(
                f"embedding dimension mismatch: model returned {len(vector)}, "
                f"target is {self.target_dimensions}"
            )
        if len(vector) < self.target_dimensions:
            vector = vector + ([0.0] * (self.target_dimensions - len(vector)))

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            raise ValueError("embedding vector has zero magnitude")
        return [value / norm for value in vector]

    @staticmethod
    def _response_error(response: httpx.Response) -> HuggingFaceEmbeddingError:
        status_code = response.status_code
        try:
            payload = response.json()
            detail = payload.get("error") if isinstance(payload, dict) else None
        except ValueError:
            detail = None

        if status_code in {401, 403}:
            message = "Hugging Face authentication failed; verify HUGGINGFACE_API_KEY permissions"
        elif status_code == 404:
            message = "Hugging Face embedding model is unavailable"
        else:
            message = f"Hugging Face embedding request failed with HTTP {status_code}"
            if detail:
                message = f"{message}: {detail}"
        return HuggingFaceEmbeddingError(message, status_code=status_code)
