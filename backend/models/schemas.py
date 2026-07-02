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
    similarity: float = 0.0
    source: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None

class Diagnostics(BaseModel):
    embeddingGenerated: bool = False
    embeddingModel: Optional[str] = None
    embeddingDimensions: Optional[int] = None
    embeddingTimeMs: Optional[int] = None
    vectorSearchPerformed: bool = False
    vectorSearchResults: int = 0
    vectorSearchTimeMs: Optional[int] = None
    rerankerUsed: bool = False
    rerankerTimeMs: Optional[int] = None
    llmPromptTokens: Optional[int] = None
    llmCompletionTokens: Optional[int] = None
    llmTimeMs: Optional[int] = None
    totalTimeMs: int = 0
    contextChunks: List[ContentChunk] = []
    toolCalls: List[Any] = []

class QueryScope(BaseModel):
    mode: str = "all"
    document_id: Optional[str] = None
    collection_id: Optional[str] = None

class QueryRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    scope: Optional[QueryScope] = None
    session_id: Optional[str] = None

class QueryResponse(BaseModel):
    answer: str
    diagnostics: Diagnostics
    session_id: Optional[str] = None

class AgentInfo(BaseModel):
    id: str
    name: str
    description: str
    supported_scopes: List[str]
    supported_tools: List[str]
    supported_models: List[str]
    agent_type: str
    enabled: bool

class PlatformHealthResponse(BaseModel):
    status: str
    uptime: int
    agents_registered: int
    active_model: str
    vector_db_status: str
    
class PlatformMetrics(BaseModel):
    uptime_seconds: int
    agents: dict[str, Any]
