import logging
import time
import uuid
from typing import Any

from services.agents.registry import AgentRegistry

logger = logging.getLogger(__name__)

class AIService:
    @staticmethod
    async def execute(
        agent_name: str, 
        query: str, 
        user_id: str, 
        **kwargs
    ) -> dict[str, Any]:
        request_id = str(uuid.uuid4())
        logger.info(f"Executing AI request", extra={"request_id": request_id, "agent": agent_name, "user_id": user_id})
        start_time = time.perf_counter()
        
        try:
            response = await AgentRegistry.execute(agent_name, query, user_id, **kwargs)
            duration = (time.perf_counter() - start_time) * 1000
            
            logger.info("AI request completed", extra={
                "request_id": request_id, 
                "duration_ms": int(duration),
                "success": True
            })
            
            # Inject request_id string if needed, although mostly in logs
            return response
        except Exception as exc:
            logger.exception("AI request failed", extra={"request_id": request_id})
            raise

    @staticmethod
    async def stream(
        agent_name: str, 
        query: str, 
        user_id: str, 
        **kwargs
    ):
        request_id = str(uuid.uuid4())
        logger.info(f"Starting AI stream", extra={"request_id": request_id, "agent": agent_name, "user_id": user_id})
        
        # Returns (diagnostics, generator, context_chunks)
        return await AgentRegistry.stream(agent_name, query, user_id, **kwargs)
