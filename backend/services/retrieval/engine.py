from abc import ABC, abstractmethod
from typing import Any
from models.schemas import ContentChunk

class BaseRetriever(ABC):
    
    @property
    def retriever_type(self) -> str:
        return "generic"
        
    @abstractmethod
    async def retrieve(self, query: str, user_id: str, **kwargs) -> list[ContentChunk]:
        """Retrieve relevant chunks for the given query and user."""
        pass

    async def rerank(self, chunks: list[ContentChunk], query: str, **kwargs) -> list[ContentChunk]:
        """Rerank matching chunks based on relevance."""
        return chunks

    async def compress(self, chunks: list[ContentChunk], **kwargs) -> list[ContentChunk]:
        """Compress or summarize retrieved chunks."""
        return chunks

    def format_context(self, chunks: list[ContentChunk]) -> str:
        """Format the retrieved chunks into a context string."""
        return "\n\n".join([chunk.content for chunk in chunks])
