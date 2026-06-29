from pydantic import BaseModel
from typing import Any, List, Optional

class DocumentIngestRequest(BaseModel):
    document_id: str
    user_id: Optional[str] = None
    title: Optional[str] = None
    file_type: Optional[str] = None
    force: bool = False

class ContentChunk(BaseModel):
    id: str
    content: str
    similarity: float
    source: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None

class Diagnostics(BaseModel):
    embeddingGenerated: bool
    embeddingModel: str
    embeddingDimensions: int
    embeddingTimeMs: int
    vectorSearchPerformed: bool
    vectorSearchResults: int
    vectorSearchTimeMs: int
    rerankerUsed: bool
    rerankerTimeMs: int
    llmPromptTokens: int
    llmCompletionTokens: int
    llmTimeMs: int
    totalTimeMs: int
    contextChunks: List[ContentChunk]
    toolCalls: List[Any]

class QueryScope(BaseModel):
    mode: str = "all"
    document_id: Optional[str] = None
    collection_id: Optional[str] = None

class QueryRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    scope: Optional[QueryScope] = None
    
class QueryResponse(BaseModel):
    answer: str
    diagnostics: Diagnostics
