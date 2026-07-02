import asyncio
from collections.abc import AsyncIterator

from services.ai.providers.base import BaseProvider, LLMResult

class MockProvider(BaseProvider):
    async def generate_text(self, prompt: str, *, system_instruction: str | None = None) -> LLMResult:
        await asyncio.sleep(0.5)
        return LLMResult(
            text="Mock response. Testing AI Platform Core.",
            prompt_tokens=10,
            completion_tokens=20
        )

    async def stream_text(self, prompt: str, *, system_instruction: str | None = None) -> AsyncIterator[str]:
        words = ["Mock ", "response. ", "Testing ", "AI ", "Platform ", "Core."]
        for word in words:
            await asyncio.sleep(0.1)
            yield word

    async def embed_text(self, text: str, *, title: str | None = None, is_query: bool = False) -> list[float]:
        # Return dummy 768-dim embeddings
        await asyncio.sleep(0.1)
        return [0.1] * 768
