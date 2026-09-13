import time
from typing import Any
from models.schemas import Diagnostics, ContentChunk
from services.agents.base import BaseAgent
from services.agents.registry import AgentRegistry
from services.ai.router import ModelRouter
from services.retrieval.document_retriever import DocumentRetriever
from services.citations import CitationService
from services.reranker import async_rerank_matches
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
            "You are KnowledgeRAG. Always answer naturally. "
            "Use retrieved context as the primary source. "
            "Merge information from multiple chunks. "
            "Explain concepts clearly. "
            "If information is partially available, provide the partial answer and state what is missing. "
            "Only state that information is unavailable when no relevant evidence exists. "
            "Never fabricate document content. "
            "Always cite supporting chunks."
        )
        
    async def _prepare(self, query: str, user_id: str, **kwargs) -> tuple[str, list[ContentChunk], Diagnostics]:
        started_at = time.perf_counter()
        import logging
        import asyncio
        from services.memory import MemoryService
        from services.intent_classifier import IntentClassifier
        from services.prompt_router import PromptRouter
        logger = logging.getLogger(__name__)
        
        document_id = kwargs.get("document_id")
        collection_id = kwargs.get("collection_id")
        scope_text = kwargs.get("scope_text", "all")
        session_id = kwargs.get("session_id")
        
        history: list[dict[str, Any]] = []
        if session_id:
            try:
                raw_history = await asyncio.to_thread(MemoryService.get_history, session_id, 8)
                history = [h for h in raw_history if not (h.get('role') == 'user' and h.get('content') == query)]
            except Exception:
                history = []

        # Intent Classification with Conversation Context Awareness
        classification = IntentClassifier.classify(query, history=history)
        intent = classification["intent"]
        requires_retrieval = classification["requires_retrieval"]
        intent_time_ms = classification["classification_time_ms"]

        logger.info(f"[RAG] Classified Intent: {intent} (requires_retrieval={requires_retrieval})")
        logger.info(f"[RAG] Search Scope: {scope_text}")

        matches = []
        search_time = 0
        rerank_time = 0
        context_chunks = []
        
        if requires_retrieval:
            search_start = time.perf_counter()
            matches = await self.retriever.retrieve(
                query, 
                user_id, 
                document_id=document_id, 
                collection_id=collection_id
            )
            search_time = int((time.perf_counter() - search_start) * 1000)
            
            rerank_start = time.perf_counter()
            as_dicts = [m.model_dump() for m in matches]
            reranked_dicts = await async_rerank_matches(as_dicts, query)
            reranked_dicts = reranked_dicts[:5] if reranked_dicts else []
            
            for rd in reranked_dicts:
                c = ContentChunk(**rd)
                context_chunks.append(c)

            # Merge adjacent chunks from the same page if they are consecutive
            if context_chunks:
                def _get_sort_key(c: ContentChunk):
                    doc_id = c.metadata.get("document_id") or ""
                    idx = int(c.metadata.get("chunk_index", 0))
                    return (doc_id, idx)
                
                sorted_chunks = sorted(context_chunks, key=_get_sort_key)
                merged_chunks = []
                
                curr = sorted_chunks[0]
                for next_c in sorted_chunks[1:]:
                    curr_doc = curr.metadata.get("document_id")
                    next_doc = next_c.metadata.get("document_id")
                    curr_idx = int(curr.metadata.get("chunk_index", -10))
                    next_idx = int(next_c.metadata.get("chunk_index", -10))
                    
                    if curr_doc == next_doc and next_idx == curr_idx + 1:
                        curr.content = curr.content + "\n\n" + next_c.content
                        curr.metadata["chunk_index"] = next_idx
                    else:
                        merged_chunks.append(curr)
                        curr = next_c
                merged_chunks.append(curr)
                context_chunks = merged_chunks
                
            rerank_time = int((time.perf_counter() - rerank_start) * 1000)
            logger.info(f"[RAG] Chunks After Reranking: {len(context_chunks)}")
            
            if len(context_chunks) == 0:
                prompt = (
                    f"The user asked about '{query}'. "
                    f"However, vector retrieval returned zero chunks for the selected document/scope. "
                    f"Explain that the selected document does not contain the requested information."
                )
            else:
                prompt = CitationService.build_prompt_context(query, context_chunks, scope_text)
        else:
            # General Chat / Non-Retrieval Intent
            prompt = (
                f"User Message: {query}\n\n"
                "Provide a helpful, friendly, and natural conversational response. "
                "Briefly mention key platform capabilities (document search with citations, codebase understanding, and guided learning)."
            )

        if history:
            history_text = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in history])
            prompt = f"Previous conversation context:\n{history_text}\n\n{prompt}"
                
        prompt_tokens = int(len(prompt.split()) * 1.3)
        logger.info(f"[RAG] final prompt token count: ~{prompt_tokens}")
        
        diagnostics = Diagnostics(
            intent=intent,
            intentClassificationTimeMs=intent_time_ms,
            embeddingGenerated=requires_retrieval,
            embeddingModel=settings.embedding_model if requires_retrieval else None,
            embeddingDimensions=settings.embedding_dimensions if requires_retrieval else None,
            embeddingTimeMs=0 if requires_retrieval else 0,
            vectorSearchPerformed=requires_retrieval,
            vectorSearchResults=len(matches),
            vectorSearchTimeMs=search_time,
            rerankerUsed=requires_retrieval and len(matches) > 0,
            rerankerTimeMs=rerank_time,
            llmPromptTokens=prompt_tokens,
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
