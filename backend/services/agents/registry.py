from typing import Any, Callable

from services.agents.base import BaseAgent

class AgentRegistry:
    _agents: dict[str, type[BaseAgent]] = {}
    _enabled: dict[str, bool] = {}

    @classmethod
    def register(cls, name: str, enabled: bool = True) -> Callable[[type[BaseAgent]], type[BaseAgent]]:
        def wrapper(agent_cls: type[BaseAgent]) -> type[BaseAgent]:
            cls._agents[name] = agent_cls
            cls._enabled[name] = enabled
            return agent_cls
        return wrapper
    
    @classmethod
    def get_agent(cls, agent_name: str) -> BaseAgent:
        agent_type = cls._agents.get(agent_name)
        if not agent_type:
            raise ValueError(f"Agent '{agent_name}' not found in registry.")
        return agent_type()
        
    @classmethod
    def get_agent_info(cls, name: str) -> dict[str, Any]:
        agent_type = cls._agents.get(name)
        if not agent_type:
            raise ValueError(f"Agent '{name}' not found in registry.")
        
        instance = agent_type()
        return {
            "id": name,
            "name": getattr(instance, "name", name),
            "description": getattr(instance, "description", ""),
            "supported_scopes": getattr(instance, "supported_scopes", []),
            "supported_tools": getattr(instance, "supported_tools", []),
            "supported_models": getattr(instance, "supported_models", []),
            "agent_type": getattr(instance, "agent_type", "generic"),
            "enabled": cls._enabled.get(name, False)
        }

    @classmethod
    def list_agents(cls) -> list[dict[str, Any]]:
        return [cls.get_agent_info(name) for name in cls._agents.keys()]
        
    @classmethod
    def is_enabled(cls, name: str) -> bool:
        return cls._enabled.get(name, False)

    @classmethod
    def enable_agent(cls, name: str):
        if name in cls._agents:
            cls._enabled[name] = True
            
    @classmethod
    def disable_agent(cls, name: str):
        if name in cls._agents:
            cls._enabled[name] = False

    @classmethod
    async def execute(cls, agent_name: str, query: str, user_id: str, **kwargs) -> Any:
        if not cls.is_enabled(agent_name):
            raise ValueError(f"Agent '{agent_name}' is disabled.")
        agent = cls.get_agent(agent_name)
        return await agent.execute(query, user_id, **kwargs)
        
    @classmethod
    async def stream(cls, agent_name: str, query: str, user_id: str, **kwargs) -> Any:
        if not cls.is_enabled(agent_name):
            raise ValueError(f"Agent '{agent_name}' is disabled.")
        agent = cls.get_agent(agent_name)
        return await agent.stream(query, user_id, **kwargs)
