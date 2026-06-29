from services.agents.base import BaseAgent
from services.agents.document_rag import DocumentRAGAgent

class AgentRegistry:
    _agents: dict[str, type[BaseAgent]] = {
        "document_rag": DocumentRAGAgent,
        # "inventory_query": InventoryAgent,
        # "codebase_rag": CodeBaseAgent,
        # etc...
    }
    
    @classmethod
    def get_agent(cls, agent_name: str) -> BaseAgent:
        agent_type = cls._agents.get(agent_name)
        if not agent_type:
            raise ValueError(f"Agent '{agent_name}' not found in registry.")
        return agent_type()
    
    @classmethod
    async def execute(cls, agent_name: str, query: str, user_id: str, **kwargs):
        agent = cls.get_agent(agent_name)
        return await agent.execute(query, user_id, **kwargs)
        
    @classmethod
    async def stream(cls, agent_name: str, query: str, user_id: str, **kwargs):
        agent = cls.get_agent(agent_name)
        return await agent.stream(query, user_id, **kwargs)
