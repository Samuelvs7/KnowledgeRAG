from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from config import settings

# Configure Gemini
genai.configure(api_key=settings.gemini_api_key)

from routers import documents, products

app = FastAPI(
    title="KnowledgeRAG API",
    description="Backend API for KnowledgeRAG AI Platform",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(products.router)

@app.get("/api/health")
async def health_check():
    return {"status": "online", "model": "gemini-2.0-flash"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
