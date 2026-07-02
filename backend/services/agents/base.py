from abc import ABC, abstractmethod
from typing import Any

class BaseAgent(ABC):
    name: str = "unknown_agent"
    description: str = "Unknown Agent"
    supported_scopes: list[str] = []
    supported_tools: list[str] = []
    supported_models: list[str] = []
    system_prompt: str | None = None
    agent_type: str = "generic"
    retriever: Any = None

    @abstractmethod
    async def execute(self, query: str, user_id: str, **kwargs) -> dict[str, Any]:
        """Execute the agent pipeline returning the complete response."""
        pass
    
    @abstractmethod
    async def stream(self, query: str, user_id: str, **kwargs):
        """Streaming version of execute."""
        pass
