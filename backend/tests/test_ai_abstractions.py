import pytest
import asyncio
from services.ai.router import ModelRouter
from services.agents.registry import AgentRegistry
from services.plugin_manager import PluginManager

@pytest.mark.asyncio
async def test_model_router_returns_provider():
    provider = ModelRouter.get_provider("gemini-2.5-flash")
    assert provider is not None
    assert hasattr(provider, "generate_text")
    assert hasattr(provider, "stream_text")
    assert hasattr(provider, "embed_text")

def test_agent_registry_loads_agents():
    PluginManager.discover_plugins()
    agent = AgentRegistry.get_agent("document_rag")
    assert agent is not None
    assert hasattr(agent, "execute")
    assert hasattr(agent, "stream")

def test_agent_registry_raises_on_unknown():
    with pytest.raises(ValueError):
        AgentRegistry.get_agent("unknown_agent")
