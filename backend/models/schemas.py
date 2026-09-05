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
    intent: Optional[str] = None
    intentClassificationTimeMs: Optional[int] = None
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

class CodebaseIngestRequest(BaseModel):
    repository_id: str
    user_id: Optional[str] = None
    force: bool = False

class CodebaseQueryRequest(BaseModel):
    query: str
    repository_id: Optional[str] = None
    user_id: Optional[str] = None
    mode: str = "explain"
    session_id: Optional[str] = None

class CodeSearchRequest(BaseModel):
    query: str
    repository_id: str
    user_id: Optional[str] = None
    match_count: int = 20

class CodebaseUrlIngestRequest(BaseModel):
    url: str
    branch: Optional[str] = None
    token: Optional[str] = None
    user_id: Optional[str] = None

class ExplainFileRequest(BaseModel):
    file_path: str
    question: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None

class ExplainFolderRequest(BaseModel):
    folder_path: str
    question: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None

class ExplainSymbolRequest(BaseModel):
    symbol_id: Optional[str] = None
    symbol_name: Optional[str] = None
    file_path: Optional[str] = None
    question: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None

class LessonRequest(BaseModel):
    topic: str
    subject: Optional[str] = "General"
    level: str = "beginner"
    document_id: Optional[str] = None

class FlashcardsRequest(BaseModel):
    topic: str
    subject: Optional[str] = "General"
    count: int = 8
    document_id: Optional[str] = None

class TutorChatRequest(BaseModel):
    query: str
    topic: Optional[str] = None
    session_id: Optional[str] = None
    document_id: Optional[str] = None

class QuizGenerateRequest(BaseModel):
    subject: str
    topic: str
    difficulty: str = "medium"
    question_count: int = 10
    source: str = "lernify_knowledge"
    document_id: Optional[str] = None

class QuizQuestionOut(BaseModel):
    id: str
    question_text: str
    options: List[str]
    hint: Optional[str] = None
    topic: str
    subject: str
    difficulty: str
    order_index: int
    source_excerpt: Optional[str] = None

class QuizOut(BaseModel):
    id: str
    title: str
    subject: str
    topic: str
    difficulty: str
    mode: str
    source: str
    question_count: int
    status: str
    questions: List[QuizQuestionOut] = []

class QuizStartResponse(BaseModel):
    attempt_id: str
    quiz: QuizOut

class QuizAnswerRecord(BaseModel):
    question_id: str
    selected_answer: Optional[str] = None
    is_correct: bool
    is_unknown: bool
    correct_answer: str
    explanation: str

class QuizResumeResponse(BaseModel):
    attempt_id: str
    quiz: QuizOut
    answers: List[QuizAnswerRecord] = []

class QuizAnswerRequest(BaseModel):
    question_id: str
    selected_answer: Optional[str] = None
    is_unknown: bool = False
    used_hint: bool = False
    time_spent_seconds: int = 0

class QuizAnswerResponse(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: str
    mastery_score: float
    mastery_label: str

class TopicBreakdownItem(BaseModel):
    subject: str
    topic: str
    accuracy: float

class QuizCompleteResponse(BaseModel):
    attempt_id: str
    score: float
    accuracy: float
    correct_count: int
    incorrect_count: int
    unknown_count: int
    skipped_count: int
    time_spent_seconds: int
    classification: str
    topic_breakdown: List[TopicBreakdownItem] = []
    learning_insight: str

class TopicMasteryOut(BaseModel):
    subject: str
    topic: str
    mastery_score: float
    accuracy: float
    questions_attempted: int
    label: str

class MistakeItemOut(BaseModel):
    id: str
    question_id: str
    subject: str
    topic: str
    status: str
    review_count: int
    question_text: Optional[str] = None
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None
    hint: Optional[str] = None

class ContinueLearningCard(BaseModel):
    subject: str
    topic: str
    quiz_id: Optional[str] = None
    attempt_id: Optional[str] = None
    progress_percent: Optional[float] = None
    reason: str

class RecommendationItem(BaseModel):
    label: str
    reason: str
    subject: Optional[str] = None
    topic: Optional[str] = None

class RecentQuizItem(BaseModel):
    attempt_id: str
    title: str
    question_count: int
    correct_count: int
    accuracy: Optional[float] = None
    completed_at: Optional[str] = None

class QuizDashboardResponse(BaseModel):
    overall_mastery: float
    questions_answered: int
    accuracy: float
    topics_mastered: int
    continue_learning: Optional[ContinueLearningCard] = None
    weak_areas: List[TopicMasteryOut] = []
    recommendations: List[RecommendationItem] = []
    recent_quizzes: List[RecentQuizItem] = []

