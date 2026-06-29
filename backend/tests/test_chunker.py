import pytest

from services.chunker import iter_document_chunks
from services.text_extractor import ExtractedSegment


def test_iter_document_chunks_preserves_citation_metadata():
    segments = [
        ExtractedSegment(
            text="Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.",
            page=3,
            section="Executive Summary",
        )
    ]

    chunks = list(
        iter_document_chunks(
            segments,
            document_id="doc-1",
            title="Quarterly Review",
            source_path="user-1/review.txt",
            collection_ids=["collection-1"],
            chunk_size=5,
            overlap=1,
        )
    )

    assert len(chunks) > 1
    assert chunks[0].chunk_index == 0
    assert chunks[1].metadata["token_offset"] == 4
    assert chunks[0].metadata["document_id"] == "doc-1"
    assert chunks[0].metadata["document_title"] == "Quarterly Review"
    assert chunks[0].metadata["page"] == 3
    assert chunks[0].metadata["section"] == "Executive Summary"
    assert chunks[0].metadata["collection_ids"] == ["collection-1"]
    assert chunks[0].metadata["source_path"] == "user-1/review.txt"


def test_iter_document_chunks_rejects_invalid_overlap():
    with pytest.raises(ValueError, match="overlap"):
        list(
            iter_document_chunks(
                [ExtractedSegment(text="hello world")],
                document_id="doc-1",
                title="Doc",
                source_path="doc.txt",
                collection_ids=[],
                chunk_size=10,
                overlap=10,
            )
        )
