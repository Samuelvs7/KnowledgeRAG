import pytest
from services.agents.registry import AgentRegistry
from services.agents.base import BaseAgent

@AgentRegistry.register("test_agent_123")
class TestAgent(BaseAgent):
    name = "Test Agent"
    async def execute(self, query, user_id, **kwargs):
        return {"answer": "test"}
    async def stream(self, query, user_id, **kwargs):
        pass

def test_registry_registration():
    agent = AgentRegistry.get_agent("test_agent_123")
    assert agent is not None
    assert agent.name == "Test Agent"

def test_list_agents():
    agents = AgentRegistry.list_agents()
    assert len(agents) > 0
    names = [a["id"] for a in agents]
    assert "test_agent_123" in names

def test_enable_disable():
    AgentRegistry.disable_agent("test_agent_123")
    assert not AgentRegistry.is_enabled("test_agent_123")
    AgentRegistry.enable_agent("test_agent_123")
    assert AgentRegistry.is_enabled("test_agent_123")
