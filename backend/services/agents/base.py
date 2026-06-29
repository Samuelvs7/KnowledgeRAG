from abc import ABC, abstractmethod
from typing import Any

class BaseAgent(ABC):
    @abstractmethod
    async def execute(self, query: str, user_id: str, **kwargs) -> dict[str, Any]:
        """Execute the agent pipeline returning the complete response."""
        pass
    
    @abstractmethod
    async def stream(self, query: str, user_id: str, **kwargs):
        """Streaming version of execute."""
        pass
