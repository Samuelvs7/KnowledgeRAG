import time
from typing import Any
from models.schemas import Diagnostics, ContentChunk
from services.agents.base import BaseAgent
from services.agents.registry import AgentRegistry
from services.ai.router import ModelRouter
from services.retrieval.document_retriever import DocumentRetriever
from services.citations import CitationService
from services.reranker import rerank_matches
from config import settings

@AgentRegistry.register("document_rag")
class DocumentRAGAgent(BaseAgent):
    name = "Document AI"
    description = "Intelligent assistant for analyzing and questioning documents."
    supported_scopes = ["all", "document", "collection"]
    supported_tools = ["search_documents"]
    supported_models = ["gemini-2.0-flash", "claude-3-5-sonnet", "gpt-4o", "mock"]
    agent_type = "document_rag"

    def __init__(self):
        self.retriever = DocumentRetriever()
        self.provider = ModelRouter.get_provider()
    
    def _rag_system_instruction(self) -> str:
        return (
            "You are KnowledgeRAG's document assistant. Be concise, grounded, and citation-first. "
            "Never use facts that are not present in the supplied context."
        )
        
    async def _prepare(self, query: str, user_id: str, **kwargs) -> tuple[str, list[ContentChunk], Diagnostics]:
        started_at = time.perf_counter()
        
        # Retrieval
        search_start = time.perf_counter()
        matches = await self.retriever.retrieve(
            query, 
            user_id, 
            document_id=kwargs.get("document_id"), 
            collection_id=kwargs.get("collection_id")
        )
        search_time = int((time.perf_counter() - search_start) * 1000)
        
        # Rerank (Currently simulation-level, keeping original matches since RRF already handled it well. 
        # But we still pass through rerank for parity with old code).
        rerank_start = time.perf_counter()
        # Convert matches to match expected schema for legacy reranker or just use score...
        as_dicts = [m.model_dump() for m in matches]
        reranked_dicts = rerank_matches(as_dicts, query)[:6] if as_dicts else []
        
        # Re-wrap
        context_chunks = []
        for rd in reranked_dicts:
            c = ContentChunk(**rd)
            context_chunks.append(c)
            
        rerank_time = int((time.perf_counter() - rerank_start) * 1000)
        
        prompt = CitationService.build_prompt_context(query, context_chunks, kwargs.get("scope_text", "all documents"))
        
        diagnostics = Diagnostics(
            embeddingGenerated=True,
            embeddingModel=settings.embedding_model,
            embeddingDimensions=settings.embedding_dimensions,
            embeddingTimeMs=0, # Abstracted inside retrieval now
            vectorSearchPerformed=True,
            vectorSearchResults=len(matches),
            vectorSearchTimeMs=search_time,
            rerankerUsed=True,
            rerankerTimeMs=rerank_time,
            llmPromptTokens=0,
            llmCompletionTokens=0,
            llmTimeMs=0,
            totalTimeMs=int((time.perf_counter() - started_at) * 1000),
            contextChunks=context_chunks,
            toolCalls=[],
        )
        
        return prompt, context_chunks, diagnostics
    
    async def execute(self, query: str, user_id: str, **kwargs) -> dict[str, Any]:
        prompt, context_chunks, diagnostics = await self._prepare(query, user_id, **kwargs)
        
        llm_start = time.perf_counter()
        response = await self.provider.generate_text(prompt, system_instruction=self._rag_system_instruction())
        llm_time = int((time.perf_counter() - llm_start) * 1000)
        
        # Update diagnostics
        payload = diagnostics.model_dump()
        payload.update({
            "llmPromptTokens": response.prompt_tokens,
            "llmCompletionTokens": response.completion_tokens,
            "llmTimeMs": llm_time,
            "totalTimeMs": payload["totalTimeMs"] + llm_time,
        })
        diagnostics = Diagnostics(**payload)
        
        return {
            "answer": response.text,
            "diagnostics": diagnostics,
            "context_chunks": [c.model_dump() for c in context_chunks]
        }

    async def stream(self, query: str, user_id: str, **kwargs):
        prompt, context_chunks, diagnostics = await self._prepare(query, user_id, **kwargs)
        
        # Return the diagnostics immediately and the generator
        gen = self.provider.stream_text(prompt, system_instruction=self._rag_system_instruction())
        return diagnostics, gen, context_chunks
