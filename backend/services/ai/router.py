import logging

from services.ai.providers.base import BaseProvider
from services.ai.providers.gemini import GeminiProvider
from services.ai.providers.mock import MockProvider
from services.ai.providers.openai import OpenAIProvider
from services.ai.providers.claude import ClaudeProvider
from services.ai.providers.ollama import OllamaProvider
from services.config_service import AgentConfig
from config import settings

logger = logging.getLogger(__name__)

class ModelRouter:
    """Routes requests to the correct AI Provider based on model prefix."""
    
    @staticmethod
    def get_provider(model_name: str | None = None, config: AgentConfig | None = None) -> BaseProvider:
        target_model = model_name or (config.model if config else settings.llm_model)
        logger.info("[STEP] model_router.select_provider target_model=%s", target_model or "default")
        logger.info("[START] Selecting AI provider")
        try:
            if not target_model:
                provider: BaseProvider = GeminiProvider()
            elif target_model == "mock":
                provider = MockProvider()
            elif target_model.startswith("gpt-") or target_model.startswith("o1-"):
                provider = OpenAIProvider()
            elif target_model.startswith("claude-"):
                provider = ClaudeProvider()
            elif target_model.startswith("ollama/"):
                provider = OllamaProvider()
            else:
                # Default to Gemini for gemini-* or unknown models
                provider = GeminiProvider()

            logger.info(
                "[SUCCESS] Selected AI provider=%s target_model=%s",
                provider.__class__.__name__,
                target_model or "default",
            )
            return provider
        except Exception:
            logger.exception("[FAILED] Selecting AI provider target_model=%s", target_model or "default")
            raise
