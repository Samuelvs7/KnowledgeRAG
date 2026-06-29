from abc import ABC, abstractmethod
from typing import Any
from models.schemas import ContentChunk

class BaseRetriever(ABC):
    @abstractmethod
    async def retrieve(self, query: str, user_id: str, **kwargs) -> list[ContentChunk]:
        """Retrieve relevant chunks for the given query and user."""
        pass
