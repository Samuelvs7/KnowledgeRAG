from typing import Any

from fastapi import APIRouter, Depends

from auth import AuthenticatedUser, get_current_user
from models.schemas import AgentInfo, PlatformHealthResponse, PlatformMetrics
from services.agents.registry import AgentRegistry
from config import settings
from services.observability import MetricsCollector

router = APIRouter(prefix="/api/platform", tags=["platform"])

@router.get("/agents", response_model=list[AgentInfo])
async def list_agents(user: AuthenticatedUser = Depends(get_current_user)):
    return AgentRegistry.list_agents()

@router.post("/agents/{name}/enable")
async def enable_agent(name: str, user: AuthenticatedUser = Depends(get_current_user)):
    AgentRegistry.enable_agent(name)
    return {"status": "enabled"}

@router.post("/agents/{name}/disable")
async def disable_agent(name: str, user: AuthenticatedUser = Depends(get_current_user)):
    AgentRegistry.disable_agent(name)
    return {"status": "disabled"}

@router.get("/health", response_model=PlatformHealthResponse)
async def get_health():
    return PlatformHealthResponse(
        status="online",
        uptime=MetricsCollector.get_metrics().get("uptime_seconds", 0),
        agents_registered=len(AgentRegistry.list_agents()),
        active_model=settings.llm_model,
        vector_db_status="connected",
    )

@router.get("/config")
async def get_config(user: AuthenticatedUser = Depends(get_current_user)):
    config = settings.model_dump()
    for k in config.keys():
        if "key" in k.lower() or "secret" in k.lower() or "url" in k.lower():
            config[k] = "***"
    return config

@router.get("/metrics", response_model=PlatformMetrics)
async def get_metrics(user: AuthenticatedUser = Depends(get_current_user)):
    return MetricsCollector.get_metrics()
