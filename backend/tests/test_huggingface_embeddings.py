import math

import httpx
import pytest

from services.ai.providers import huggingface
from services.ai.providers.huggingface import (
    HuggingFaceEmbeddingError,
    HuggingFaceEmbeddingProvider,
)
from services.retry import is_transient_error


def _provider(handler, *, max_retry_attempts: int = 3) -> HuggingFaceEmbeddingProvider:
    return HuggingFaceEmbeddingProvider(
        api_key="hf_test",
        model="BAAI/bge-small-en-v1.5",
        target_dimensions=768,
        timeout_seconds=5,
        max_retry_attempts=max_retry_attempts,
        transport=httpx.MockTransport(handler),
    )


def test_huggingface_embedding_pads_native_384_dimensions_to_768() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/BAAI/bge-small-en-v1.5")
        assert request.headers["authorization"] == "Bearer hf_test"
        payload = request.read().decode()
        assert "hello world" in payload
        return httpx.Response(200, json=[[1.0] * 384])

    embedding = _provider(handler).embed_text_sync("hello world", title="Smoke")

    assert len(embedding) == 768
    assert embedding[384:] == [0.0] * 384
    assert math.isclose(math.sqrt(sum(value * value for value in embedding)), 1.0)


def test_huggingface_auth_failure_does_not_retry() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(401, json={"error": "bad token"})

    with pytest.raises(HuggingFaceEmbeddingError, match="authentication failed"):
        _provider(handler).embed_text_sync("hello world")

    assert calls == 1


def test_huggingface_transient_failure_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(huggingface.time, "sleep", lambda _: None)
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, json={"error": "model loading"})
        return httpx.Response(200, json=[[0.5] * 384])

    embedding = _provider(handler).embed_text_sync("retry me")

    assert calls == 2
    assert len(embedding) == 768


def test_retry_helper_reads_http_response_status() -> None:
    request = httpx.Request("POST", "https://example.test")
    assert not is_transient_error(
        httpx.HTTPStatusError(
            "Unauthorized",
            request=request,
            response=httpx.Response(401, request=request),
        )
    )
    assert is_transient_error(
        httpx.HTTPStatusError(
            "Service unavailable",
            request=request,
            response=httpx.Response(503, request=request),
        )
    )
