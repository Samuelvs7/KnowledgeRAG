import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from models.schemas import Diagnostics

logger = logging.getLogger(__name__)

class StreamingService:
    @staticmethod
    def format_sse(event: str, data: dict[str, Any]) -> str:
        return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"

    @staticmethod
    async def stream_with_diagnostics(
        generator: AsyncIterator[str], 
        diagnostics: Diagnostics,
        session_id: str
    ) -> AsyncIterator[str]:
        yield StreamingService.format_sse("context", {"diagnostics": _model_dump(diagnostics), "session_id": session_id})
        
        answer_parts = []
        try:
            async for delta in generator:
                answer_parts.append(delta)
                yield StreamingService.format_sse("delta", {"text": delta})
                
            answer = "".join(answer_parts).strip()
            
            payload = _model_dump(diagnostics)
            payload["llmTimeMs"] = int(time.perf_counter() * 1000) - payload["totalTimeMs"]
            payload["totalTimeMs"] = int(time.perf_counter() * 1000)
            
            # Approximation if tokens not streamed
            if payload.get("llmCompletionTokens", 0) == 0:
                payload["llmCompletionTokens"] = len(answer) // 4
                
            final_diagnostics = Diagnostics(**payload)
            yield StreamingService.format_sse("done", {"answer": answer, "diagnostics": _model_dump(final_diagnostics), "session_id": session_id})
        except asyncio.CancelledError:
            logger.info("Stream cancelled by client")
            raise
        except Exception as exc:
            logger.exception("Stream failed")
            yield StreamingService.format_sse("error", {"message": str(exc)})

def _model_dump(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if hasattr(model, "dict"):
        return model.dict()
    return dict(model)
