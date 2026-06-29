from services.ai.providers.base import BaseProvider
from services.ai.providers.gemini import GeminiProvider

class ModelRouter:
    """Routes requests to the correct AI Provider based on model prefix."""
    
    @staticmethod
    def get_provider(model_name: str | None = None) -> BaseProvider:
        # Currently defaults directly to GeminiProvider.
        # Future-proofing: add rules like if model_name.startswith('gpt-4') return OpenAIProvider()
        return GeminiProvider()
