import json

import pytest
from fastapi import HTTPException

from routers.documents import (
    _validated_storage_path,
)
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
