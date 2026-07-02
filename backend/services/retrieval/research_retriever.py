from models.schemas import ContentChunk
from services.retrieval.engine import BaseRetriever

class ResearchRetriever(BaseRetriever):
    @property
    def retriever_type(self) -> str:
        return "research"
        
    async def retrieve(self, query: str, user_id: str, **kwargs) -> list[ContentChunk]:
        return []
