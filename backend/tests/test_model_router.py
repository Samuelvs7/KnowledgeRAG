import pytest
from services.ai.router import ModelRouter
from services.ai.providers.mock import MockProvider
from services.ai.providers.gemini import GeminiProvider
from services.ai.providers.openai import OpenAIProvider
from services.ai.providers.claude import ClaudeProvider
from services.ai.providers.ollama import OllamaProvider

def test_model_router_mock():
    provider = ModelRouter.get_provider("mock")
    assert isinstance(provider, MockProvider)

def test_model_router_default():
    provider = ModelRouter.get_provider("unknown_model_123")
    assert isinstance(provider, GeminiProvider)

def test_model_router_claude():
    provider = ModelRouter.get_provider("claude-3-5-sonnet")
    assert isinstance(provider, ClaudeProvider)

def test_model_router_openai():
    provider = ModelRouter.get_provider("gpt-4o")
    assert isinstance(provider, OpenAIProvider)

def test_model_router_ollama():
    provider = ModelRouter.get_provider("ollama/llama3")
    assert isinstance(provider, OllamaProvider)
