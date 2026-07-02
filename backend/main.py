from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from logging_config import configure_logging

configure_logging()

from routers import documents, products, sessions, search, platform
from middleware import RequestIdMiddleware, MetricsMiddleware
from services.plugin_manager import PluginManager

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    _log_startup_diagnostics()
    PluginManager.discover_plugins()
    await documents.recover_pending_ingestions()
    yield

app = FastAPI(
    title="KnowledgeRAG API",
    description="Backend API for KnowledgeRAG AI Platform",
    version="2.0.0",
    lifespan=lifespan,
)

# Configure Middlewares
app.add_middleware(MetricsMiddleware)
app.add_middleware(RequestIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(products.router)
app.include_router(sessions.router)
app.include_router(search.router)
app.include_router(platform.router)


def _package_version(package_name: str) -> str:
    try:
        return version(package_name)
    except PackageNotFoundError:
        return "not-installed"


def _log_startup_diagnostics() -> None:
    logger.info("[STEP] startup.environment")
    logger.info("[SUCCESS] SUPABASE_URL loaded=%s", bool(settings.supabase_url))
    logger.info("[SUCCESS] SUPABASE_SERVICE_ROLE_KEY loaded=%s", bool(settings.supabase_service_role_key))
    logger.info("[SUCCESS] GEMINI_API_KEY loaded=%s", bool(settings.gemini_api_key))
    logger.info("[SUCCESS] Embedding model=%s", settings.embedding_model)
    logger.info("[SUCCESS] Embedding dimensions=%s", settings.embedding_dimensions)
    logger.info("[SUCCESS] Provider selected=%s", settings.default_provider)
    logger.info("[SUCCESS] CORS origins=%s", settings.allowed_origins)

    logger.info("[STEP] startup.gemini_sdk")
    logger.info("[START] Inspecting Gemini SDK")
    try:
        import google.genai as genai_pkg

        logger.info("[SUCCESS] Gemini SDK version=%s", getattr(genai_pkg, "__version__", "unknown"))
        logger.info("[SUCCESS] Installed package google-genai version=%s", _package_version("google-genai"))
        logger.info("[SUCCESS] Embedding model name=%s", settings.embedding_model)
    except Exception:
        logger.exception("[FAILED] Gemini SDK inspection failed")
        raise


@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "model": settings.llm_model,
        "embedding_model": settings.embedding_model,
        "embedding_dimensions": settings.embedding_dimensions,
    }

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
