from models.schemas import ContentChunk
from services.retrieval.engine import BaseRetriever

class SQLRetriever(BaseRetriever):
    @property
    def retriever_type(self) -> str:
        return "sql"
        
    async def retrieve(self, query: str, user_id: str, **kwargs) -> list[ContentChunk]:
        return []
