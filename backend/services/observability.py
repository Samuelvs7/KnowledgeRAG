import time
from dataclasses import dataclass
from typing import Any

@dataclass
class AgentMetrics:
    total_requests: int = 0
    total_latency_ms: int = 0
    errors: int = 0
    llm_tokens: int = 0

class MetricsCollector:
    _start_time = time.time()
    _agent_metrics: dict[str, AgentMetrics] = {}

    @classmethod
    def record_request(cls, agent_name: str, latency_ms: int, success: bool, tokens: int = 0) -> None:
        if agent_name not in cls._agent_metrics:
            cls._agent_metrics[agent_name] = AgentMetrics()
            
        metrics = cls._agent_metrics[agent_name]
        metrics.total_requests += 1
        metrics.total_latency_ms += latency_ms
        if not success:
            metrics.errors += 1
        metrics.llm_tokens += tokens

    @classmethod
    def get_metrics(cls) -> dict[str, Any]:
        return {
            "uptime_seconds": int(time.time() - cls._start_time),
            "agents": {
                name: {
                    "requests": state.total_requests,
                    "avg_latency": (state.total_latency_ms // state.total_requests) if state.total_requests else 0,
                    "errors": state.errors,
                    "tokens": state.llm_tokens,
                }
                for name, state in cls._agent_metrics.items()
            }
        }
