from typing import Any
from services.agents.base import BaseAgent
from services.agents.registry import AgentRegistry

@AgentRegistry.register("code")
class CodeAgent(BaseAgent):
    name = "Codebase AI"
    description = "Intelligent assistant for code and repository analysis."
    supported_scopes = ["all", "repository"]
    supported_tools = ["search_code"]
    supported_models = ["gemini-2.0-flash", "claude-3-5-sonnet", "gpt-4o", "mock"]
    agent_type = "code_agent"

    async def execute(self, query: str, user_id: str, **kwargs) -> dict[str, Any]:
        return {"answer": "Code agent scaffold response.", "diagnostics": {}}

    async def stream(self, query: str, user_id: str, **kwargs):
        pass
