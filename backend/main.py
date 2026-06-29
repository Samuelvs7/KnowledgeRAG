from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from logging_config import configure_logging

configure_logging()

from routers import documents, products

@asynccontextmanager
async def lifespan(app: FastAPI):
    await documents.recover_pending_ingestions()
    yield

app = FastAPI(
    title="KnowledgeRAG API",
    description="Backend API for KnowledgeRAG AI Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(products.router)

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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
