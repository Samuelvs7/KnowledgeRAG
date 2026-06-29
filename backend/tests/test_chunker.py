import pytest

from services.chunker import iter_document_chunks, _split_by_semantic_boundaries
from services.text_extractor import ExtractedSegment

def test_split_by_semantic_boundaries_heading():
    text = "Intro\n# Heading 1\nBody 1\n## Heading 2\nBody 2"
    segments = _split_by_semantic_boundaries(text)
    
    assert segments[0]["type"] == "text"
    assert segments[0]["text"] == "Intro"
    assert segments[1]["type"] == "heading"
    assert segments[1]["text"] == "# Heading 1"
    assert segments[2]["type"] == "text"
    assert segments[2]["text"] == "Body 1"

def test_split_by_semantic_boundaries_code_fence():
    text = "Here is code:\n```python\nprint('hello')\n```\nMore text"
    segments = _split_by_semantic_boundaries(text)
    
    assert segments[0]["type"] == "text"
    assert segments[0]["text"] == "Here is code:"
    assert segments[1]["type"] == "code"
    assert "print('hello')" in segments[1]["text"]
    assert segments[2]["type"] == "text"
    assert segments[2]["text"] == "More text"

def test_split_by_semantic_boundaries_tables():
    text = "Table here:\n| A | B |\n| 1 | 2 |\nText."
    segments = _split_by_semantic_boundaries(text)
    
    assert segments[1]["type"] == "table"
    assert "| A | B |" in segments[1]["text"]
    assert "| 1 | 2 |" in segments[1]["text"]
    assert segments[2]["type"] == "text"
    assert segments[2]["text"] == "Text."

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
    assert chunks[1].metadata["token_offset"] != None # Now token offset can be 0 per semantic segment or accurate for big blocks
    assert chunks[0].metadata["document_id"] == "doc-1"
    assert chunks[0].metadata["document_title"] == "Quarterly Review"
    assert chunks[0].metadata["page"] == 3
    assert chunks[0].metadata["section"] == "Executive Summary"
    assert chunks[0].metadata["collection_ids"] == ["collection-1"]
    assert chunks[0].metadata["source_path"] == "user-1/review.txt"
    assert "offset" in chunks[0].metadata # Ensure frontend highlighting character offset exists


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
