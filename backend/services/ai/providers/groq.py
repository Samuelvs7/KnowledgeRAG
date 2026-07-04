import asyncio
import logging
from collections.abc import AsyncIterator

try:
    from groq import AsyncGroq
    import groq
except ImportError:
    AsyncGroq = None
    groq = None

from config import settings
from services.ai.providers.base import BaseProvider, LLMResult
from services.retry import with_retry

logger = logging.getLogger(__name__)

class GroqProvider(BaseProvider):
    def __init__(self):
        logger.info("[STEP] groq.initialization")
        logger.info(
            "[START] Initializing Groq client llm_model=%s",
            settings.llm_model,
        )
        if not AsyncGroq:
            raise ImportError("groq is not installed. Please install groq to use the Groq provider.")
            
        if not settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is not configured")

        try:
            self.client = AsyncGroq(
                api_key=settings.groq_api_key,
                # Use retry settings from config, no internal retry for auth errors
                max_retries=0, 
            )
        except Exception:
            logger.exception("[FAILED] Groq client initialization failed")
            raise
        
        logger.info("[SUCCESS] Groq client initialized")

    async def generate_text(self, prompt: str, *, system_instruction: str | None = None) -> LLMResult:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        async def operation():
            try:
                response = await self.client.chat.completions.create(
                    messages=messages,
                    model=settings.llm_model,
                    temperature=0.2,
                )
                return response
            except groq.AuthenticationError as e:
                # Do not retry on authentication error
                logger.error("[ERROR] Groq authentication failed")
                raise ValueError("Groq authentication failed. Please check your API key.") from e

        # Use our own retry mechanism for transient errors (exponential backoff handled by with_retry, though not strictly exponential unless with_retry does it, it's what was requested and in the stack previously for gemini)
        response = await with_retry(
            operation,
            attempts=settings.max_retry_attempts,
            timeout_seconds=settings.llm_timeout_seconds,
        )
        
        return self._result_from_response(response)

    async def stream_text(self, prompt: str, *, system_instruction: str | None = None) -> AsyncIterator[str]:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        # No retry logic for streaming in with_retry usually, just yield
        try:
            stream = await self.client.chat.completions.create(
                messages=messages,
                model=settings.llm_model,
                temperature=0.2,
                stream=True,
                # Timeout added specifically per prompt's "production-grade error handling"
                timeout=settings.llm_timeout_seconds
            )
            async for chunk in stream:
                content = chunk.choices[0].delta.content if chunk.choices else None
                if content:
                    yield content
        except groq.AuthenticationError as e:
            logger.error("[ERROR] Groq authentication failed during stream")
            raise ValueError("Groq authentication failed") from e
        except Exception as e:
            logger.exception("[ERROR] Error in Groq stream")
            raise RuntimeError("LLM stream failed") from e

    def _result_from_response(self, response) -> LLMResult:
        content = response.choices[0].message.content or ""
        usage = response.usage
        
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        
        return LLMResult(
            text=content.strip(),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
