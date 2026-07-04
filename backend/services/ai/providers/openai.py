from collections.abc import AsyncIterator
from services.ai.providers.base import BaseProvider, LLMResult
from config import settings

class OpenAIProvider(BaseProvider):
    def __init__(self):
        pass

    async def generate_text(self, prompt: str, *, system_instruction: str | None = None) -> LLMResult:
        if not settings.openai_api_key:
            raise ValueError("OpenAI API key not configured")
        raise NotImplementedError("OpenAI integration scaffolding only")

    async def stream_text(self, prompt: str, *, system_instruction: str | None = None) -> AsyncIterator[str]:
        if not settings.openai_api_key:
            raise ValueError("OpenAI API key not configured")
        raise NotImplementedError("OpenAI integration scaffolding only")
        yield ""
