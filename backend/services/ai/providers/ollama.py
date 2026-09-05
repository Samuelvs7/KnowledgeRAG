import asyncio
import json
import logging
from collections.abc import AsyncIterator

import httpx

from config import settings
from services.ai.providers.base import BaseProvider, LLMResult
from services.retry import with_retry

logger = logging.getLogger(__name__)

class OllamaProvider(BaseProvider):
    def __init__(self):
        logger.info("[STEP] ollama.initialization")
        self.base_url = settings.ollama_base_url.rstrip("/")
        # Extract the model name, e.g., 'ollama/qwen:14b' -> 'qwen:14b'
        self.model = settings.llm_model.replace("ollama/", "") if settings.llm_model.startswith("ollama/") else settings.llm_model
        logger.info(f"[START] Initializing Ollama provider for model={self.model} at {self.base_url}")

    async def generate_text(self, prompt: str, *, system_instruction: str | None = None) -> LLMResult:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.2
            }
        }

        async def operation():
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                response = await client.post(f"{self.base_url}/api/chat", json=payload)
                response.raise_for_status()
                return response.json()

        try:
            data = await with_retry(
                operation,
                attempts=settings.max_retry_attempts,
                timeout_seconds=settings.llm_timeout_seconds
            )
        except Exception as e:
            logger.error(f"[ERROR] Ollama generate_text failed: {e}")
            raise

        message = data.get("message", {})
        content = message.get("content", "")

        return LLMResult(
            text=content.strip(),
            prompt_tokens=data.get("prompt_eval_count", 0),
            completion_tokens=data.get("eval_count", 0)
        )

    async def stream_text(self, prompt: str, *, system_instruction: str | None = None) -> AsyncIterator[str]:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": 0.2
            }
        }

        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                            if "message" in chunk and "content" in chunk["message"]:
                                yield chunk["message"]["content"]
                        except json.JSONDecodeError:
                            logger.warning(f"[WARNING] Unparseable chunk from Ollama: {line}")
        except Exception as e:
            logger.error(f"[ERROR] Ollama stream_text failed: {e}")
            raise RuntimeError("LLM stream failed") from e

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/")
                return response.status_code == 200
        except Exception:
            return False
            
    async def list_models(self) -> list[dict]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                response.raise_for_status()
                return response.json().get("models", [])
        except Exception:
            return []
