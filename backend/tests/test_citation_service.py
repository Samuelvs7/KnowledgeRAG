import pytest
from services.citations import CitationService
from models.schemas import ContentChunk

def test_citation_formatting():
    chunks = [ContentChunk(id="1", content="test snippet", similarity=0.9, source="Doc1")]
    doc_context = CitationService.build_prompt_context("query?", chunks, "scope", citation_type="document")
    assert "test snippet" in doc_context
    assert "[1] Source: Doc1" in doc_context

    code_context = CitationService.build_prompt_context("query?", chunks, "scope", citation_type="code")
    assert "test snippet" in code_context
