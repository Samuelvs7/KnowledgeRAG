import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from routers import documents
from routers.documents import (
    _validated_storage_path,
)
from services.chunker import DocumentChunk
from services.streaming import StreamingService
from services.citations import CitationService
from services.retrieval.document_retriever import DocumentRetriever


def test_validated_storage_path_accepts_owned_relative_path():
    assert _validated_storage_path("user-1/file.pdf", "user-1") == "user-1/file.pdf"


def test_validated_storage_path_accepts_owned_storage_url():
    url = "https://project.supabase.co/storage/v1/object/private/documents/user-1/folder/file.pdf"

    assert _validated_storage_path(url, "user-1") == "user-1/folder/file.pdf"


def test_validated_storage_path_rejects_other_users_path():
    with pytest.raises(HTTPException) as exc_info:
        _validated_storage_path("user-2/file.pdf", "user-1")

    assert exc_info.value.status_code == 403


def test_validated_storage_path_rejects_traversal():
    with pytest.raises(HTTPException) as exc_info:
        _validated_storage_path("user-1/../file.pdf", "user-1")

    assert exc_info.value.status_code == 400


def test_content_chunk_from_match_builds_rich_citation_source():
    retriever = DocumentRetriever()
    chunk = retriever._content_chunk_from_match({
        "id": "chunk-1",
        "document_id": "doc-1",
        "document_title": "Benefits Handbook",
        "content": "Vacation policy text.",
        "chunk_index": 2,
        "metadata": {"page": 7},
        "collection_id": "collection-1",
        "collection_name": "HR",
        "score": 0.88,
    })

    assert chunk.source == "Benefits Handbook - page 7 - chunk 3 - collection HR"
    assert chunk.metadata["document_id"] == "doc-1"
    assert chunk.metadata["collection_name"] == "HR"


def test_build_prompt_requires_context_bound_answering():
    prompt = CitationService.build_prompt_context(
        "What is the vacation policy?",
        [],
        "all indexed documents owned by the authenticated user",
    )

    assert "Use only the provided context" in prompt
    assert "No matching document chunks were found" in prompt
    assert "Question: What is the vacation policy?" in prompt


def test_sse_serializes_named_event():
    event = StreamingService.format_sse("delta", {"text": "hello"})
    assert event.startswith("event: delta\n")
    assert event.endswith("\n\n")
    assert json.loads(event.split("data: ", 1)[1]) == {"text": "hello"}


@pytest.mark.asyncio
async def test_run_ingestion_marks_failed_when_embedding_generation_fails(monkeypatch):
    updates: list[tuple[str, dict]] = []

    class FailingEmbeddingProvider:
        async def embed_text(self, text: str, *, title: str | None = None, is_query: bool = False):
            raise RuntimeError("Hugging Face embedding request failed with HTTP 503")

    async def fake_download_storage_object(file_path: str, temp_dir: str) -> Path:
        local_path = Path(temp_dir) / "source.txt"
        local_path.write_text("hello world", encoding="utf-8")
        return local_path

    def fake_update_ingestion(document_id: str, status_value: str, **kwargs):
        updates.append((status_value, kwargs))

    monkeypatch.setattr(
        documents,
        "_get_document_for_user",
        lambda document_id, user_id: {
            "id": document_id,
            "file_url": f"{user_id}/source.txt",
            "file_type": "text/plain",
            "title": "Source",
        },
    )
    monkeypatch.setattr(documents, "_increment_ingestion_attempt", lambda document_id: None)
    monkeypatch.setattr(documents, "_download_storage_object", fake_download_storage_object)
    monkeypatch.setattr(documents, "extract_metadata", lambda local_path, file_type: {})
    monkeypatch.setattr(documents, "_update_document_metadata", lambda document_id, metadata: None)
    monkeypatch.setattr(documents, "_collection_ids_for_document", lambda document_id, user_id: [])
    monkeypatch.setattr(
        documents,
        "_build_chunks",
        lambda *args, **kwargs: [
            DocumentChunk(content="hello world", chunk_index=0, metadata={"source": "source.txt"})
        ],
    )
    monkeypatch.setattr(documents.ModelRouter, "get_provider", staticmethod(lambda: FailingEmbeddingProvider()))
    monkeypatch.setattr(documents, "_cleanup_staging", lambda document_id, job_id: None)
    monkeypatch.setattr(documents, "_update_ingestion", fake_update_ingestion)

    await documents._run_ingestion("doc-1", "user-1", "job-1")

    statuses = [status for status, _ in updates]
    assert "embedding" in statuses
    assert "ready" not in statuses
    assert updates[-1][0] == "failed"
    assert "Embedding generation failed" in updates[-1][1]["error_message"]
    assert "HTTP 503" in updates[-1][1]["error_message"]
    assert updates[-1][1]["completed"] is True
