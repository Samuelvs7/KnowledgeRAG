from collections.abc import AsyncIterator
from services.ai.providers.base import BaseProvider, LLMResult
from config import settings

class OllamaProvider(BaseProvider):
    def __init__(self):
        pass

    async def generate_text(self, prompt: str, *, system_instruction: str | None = None) -> LLMResult:
        raise NotImplementedError("Ollama integration scaffolding only")

    async def stream_text(self, prompt: str, *, system_instruction: str | None = None) -> AsyncIterator[str]:
        raise NotImplementedError("Ollama integration scaffolding only")
        yield ""

    async def embed_text(self, text: str, *, title: str | None = None, is_query: bool = False) -> list[float]:
        raise NotImplementedError("Ollama integration scaffolding only")
