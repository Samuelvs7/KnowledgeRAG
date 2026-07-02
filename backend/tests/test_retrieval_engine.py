import pytest
from services.retrieval.engine import BaseRetriever
from models.schemas import ContentChunk

class DummyRetriever(BaseRetriever):
    async def retrieve(self, query, user_id, **kwargs):
        return []

@pytest.mark.asyncio
async def test_retrieval_engine_defaults():
    retriever = DummyRetriever()
    assert retriever.retriever_type == "generic"
    chunks = [ContentChunk(id="1", content="test snippet")]
    assert await retriever.rerank(chunks, "test") == chunks
    assert await retriever.compress(chunks) == chunks
    assert retriever.format_context(chunks) == "test snippet"
