from typing import Any
from services.agents.base import BaseAgent
from services.agents.registry import AgentRegistry

@AgentRegistry.register("sql")
class SQLAgent(BaseAgent):
    name = "SQL AI"
    description = "Intelligent assistant for database querying and analysis."
    supported_scopes = ["all", "table", "database"]
    supported_tools = ["execute_sql"]
    supported_models = ["gemini-2.0-flash", "claude-3-5-sonnet", "gpt-4o", "mock"]
    agent_type = "sql_agent"

    async def execute(self, query: str, user_id: str, **kwargs) -> dict[str, Any]:
        return {"answer": "SQL agent scaffold response.", "diagnostics": {}}

    async def stream(self, query: str, user_id: str, **kwargs):
        pass
