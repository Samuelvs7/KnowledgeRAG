from typing import Any
from services.agents.base import BaseAgent
from services.agents.registry import AgentRegistry

@AgentRegistry.register("stock")
class StockAgent(BaseAgent):
    name = "Stock AI"
    description = "Intelligent assistant for stock and financial analysis."
    supported_scopes = ["all", "ticker"]
    supported_tools = ["search_financials"]
    supported_models = ["gemini-2.0-flash", "claude-3-5-sonnet", "gpt-4o", "mock"]
    agent_type = "stock_agent"

    async def execute(self, query: str, user_id: str, **kwargs) -> dict[str, Any]:
        return {"answer": "Stock agent scaffold response.", "diagnostics": {}}

    async def stream(self, query: str, user_id: str, **kwargs):
        pass
