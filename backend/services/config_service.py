import os
from dataclasses import dataclass

from config import settings

@dataclass
class AgentConfig:
    model: str
    embedding_model: str
    temperature: float
    top_k: int
    chunk_size: int
    overlap: int
    streaming_enabled: bool
    system_prompt: str | None = None
    
class ConfigurationService:
    @staticmethod
    def get_agent_config(agent_name: str) -> AgentConfig:
        if agent_name == "document_rag":
            return AgentConfig(
                model=settings.llm_model,
                embedding_model=settings.embedding_model,
                temperature=0.2,
                top_k=5,
                chunk_size=500,
                overlap=50,
                streaming_enabled=True,
            )
        
        # Generic default
        return AgentConfig(
            model=settings.llm_model,
            embedding_model=settings.embedding_model,
            temperature=0.7,
            top_k=5,
            chunk_size=500,
            overlap=50,
            streaming_enabled=True,
        )
