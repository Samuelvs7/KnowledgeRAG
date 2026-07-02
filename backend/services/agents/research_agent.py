from typing import Any
from services.agents.base import BaseAgent
from services.agents.registry import AgentRegistry

@AgentRegistry.register("research")
class ResearchAgent(BaseAgent):
    name = "Research AI"
    description = "Intelligent assistant for deep web research."
    supported_scopes = ["all", "topic"]
    supported_tools = ["search_web"]
    supported_models = ["gemini-2.0-flash", "claude-3-5-sonnet", "gpt-4o", "mock"]
    agent_type = "research_agent"

    async def execute(self, query: str, user_id: str, **kwargs) -> dict[str, Any]:
        return {"answer": "Research agent scaffold response.", "diagnostics": {}}

    async def stream(self, query: str, user_id: str, **kwargs):
        pass
