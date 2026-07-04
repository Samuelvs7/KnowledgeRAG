from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass

@dataclass(frozen=True)
class LLMResult:
    text: str
    prompt_tokens: int = 0
    completion_tokens: int = 0

class BaseProvider(ABC):
    @abstractmethod
    async def generate_text(self, prompt: str, *, system_instruction: str | None = None) -> LLMResult:
        pass

    @abstractmethod
    async def stream_text(self, prompt: str, *, system_instruction: str | None = None) -> AsyncIterator[str]:
        pass

    async def embed_text(self, text: str, *, title: str | None = None, is_query: bool = False) -> list[float]:
        from services.embeddings import embed_text

        return await embed_text(text, title=title, is_query=is_query)
