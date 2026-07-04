from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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
    logger.info("[SUCCESS] Embedding provider=%s", settings.embedding_provider)
    logger.info("[SUCCESS] HUGGINGFACE_API_KEY loaded=%s", bool(settings.huggingface_api_key))
    logger.info("[SUCCESS] Embedding model=%s", settings.embedding_model)
    logger.info("[SUCCESS] Embedding dimensions=%s", settings.embedding_dimensions)
    logger.info("[SUCCESS] LLM model=%s", settings.llm_model)
    logger.info("[SUCCESS] LLM provider=%s", settings.llm_provider)
    logger.info("[SUCCESS] CORS origins=%s", settings.allowed_origins)

    logger.info("[STEP] startup.gemini_sdk")
    logger.info("[START] Inspecting Gemini SDK")
    try:
        import google.genai as genai_pkg

        logger.info("[SUCCESS] Gemini SDK version=%s", getattr(genai_pkg, "__version__", "unknown"))
        logger.info("[SUCCESS] Installed package google-genai version=%s", _package_version("google-genai"))
        logger.info("[SUCCESS] Gemini chat model name=%s", settings.llm_model)
    except Exception:
        logger.exception("[FAILED] Gemini SDK inspection failed")
        raise


@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "model": settings.llm_model,
        "embedding_provider": settings.embedding_provider,
        "embedding_model": settings.embedding_model,
        "embedding_dimensions": settings.embedding_dimensions,
    }

# ---------------------------------------------------------------------------
# Frontend Static File Serving (Docker single-container deployment)
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).resolve().parent / "static"

if STATIC_DIR.is_dir():
    # Serve built frontend assets (JS, CSS, images) at /assets
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="frontend-assets")

    # SPA catch-all: any non-API route returns index.html so React Router works
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # If the requested file exists in static dir, serve it directly
        file_path = STATIC_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        # Otherwise return index.html for client-side routing
        return FileResponse(STATIC_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
