import time
import logging
import asyncio
from typing import Any, Tuple
from models.schemas import Diagnostics, ContentChunk
from services.agents.base import BaseAgent
from services.agents.registry import AgentRegistry
from services.ai.router import ModelRouter
from services.retrieval.code_retriever import CodeRetriever
from services.citations import CitationService
from services.reranker import async_rerank_matches
from services.memory import MemoryService
from config import settings

logger = logging.getLogger(__name__)


@AgentRegistry.register("code")
class CodeAgent(BaseAgent):
    name = "Codebase AI"
    description = "Intelligent assistant for software repository search, understanding, tracing, debugging, and architecture analysis."
    supported_scopes = ["all", "repository"]
    supported_tools = ["search_code", "extract_symbols", "trace_dependencies"]
    supported_models = ["gemini-2.0-flash", "claude-3-5-sonnet", "gpt-4o", "mock"]
    agent_type = "code_agent"

    def __init__(self):
        self.retriever = CodeRetriever()
        self.provider = ModelRouter.get_provider()

    def _code_system_instruction(self, mode: str = "explain") -> str:
        base_instruction = (
            "You are KnowledgeRAG GitHub Intelligence — an expert AI Repository Assistant. "
            "Your task is to help developers understand, trace, debug, test, and analyze code repositories. "
            "RULES:\n"
            "1. Ground all technical answers in the retrieved repository code context.\n"
            "2. Always cite specific source file paths and line ranges using bracketed numbers like [1].\n"
            "3. Clearly distinguish between OBSERVED REPOSITORY FACTS (code in context) and AI INFERENCES/RECOMMENDATIONS.\n"
            "4. If the retrieved context is insufficient, explain what is missing rather than inventing code.\n"
            "5. Format code snippets cleanly with appropriate language tags.\n\n"
            "OUTPUT FORMAT (the UI renders GitHub-flavored Markdown — use it to make answers scannable and engaging; "
            "NEVER reply as one long paragraph):\n"
            "- Open with a one-sentence **TL;DR** in bold that directly answers the question.\n"
            "- Break the rest into short `##` sections with clear titles (e.g. What it does, How it works, Key functions, Gotchas).\n"
            "- Prefer tight bullet lists over prose. Bold the key term at the start of a bullet.\n"
            "- Put ALL code in fenced blocks with a language tag (```python, ```ts, …). Reference symbols inline as `code`.\n"
            "- Use a `> ` callout for an important warning or insight, and a Markdown table when comparing things.\n"
            "- Keep it concise and high-signal; every line should earn its place."
        )

        mode_instructions = {
            "explain": "Focus on clearly explaining how the code components work, their purpose, and key algorithms.",
            "trace": "Trace the execution flow, function call hierarchy, and data transformations step by step across files.",
            "debug": "Identify potential bugs, edge cases, race conditions, type errors, or logic flaws in the code.",
            "impact": "Perform an impact analysis: detail which files, components, and callers would be affected by modifying this code.",
            "tests": "Generate comprehensive unit tests, edge-case tests, and integration test strategy for the code.",
            "architecture": "Explain the high-level architecture, module boundaries, design patterns, and entry points based on observed evidence."
        }

        specific_mode = mode_instructions.get(mode, mode_instructions["explain"])
        return f"{base_instruction}\n\nSPECIALIZED FOCUS: {specific_mode}"

    async def _prepare(self, query: str, user_id: str, **kwargs) -> Tuple[str, list[ContentChunk], Diagnostics]:
        started_at = time.perf_counter()
        repository_id = kwargs.get("repository_id")
        session_id = kwargs.get("session_id")
        mode = kwargs.get("mode", "explain")
        scope_text = kwargs.get("scope_text", f"Repository {repository_id or 'all'}")

        if not repository_id:
            raise ValueError("repository_id is required for CodeAgent operations to guarantee repository isolation.")

        history: list[dict[str, Any]] = []
        if session_id:
            try:
                raw_history = await asyncio.to_thread(MemoryService.get_history, session_id, 8)
                history = [h for h in raw_history if not (h.get('role') == 'user' and h.get('content') == query)]
            except Exception:
                history = []

        search_start = time.perf_counter()
        matches = await self.retriever.retrieve(
            query,
            user_id,
            repository_id=repository_id
        )
        search_time = int((time.perf_counter() - search_start) * 1000)

        rerank_start = time.perf_counter()
        as_dicts = [m.model_dump() for m in matches]
        reranked_dicts = await async_rerank_matches(as_dicts, query)
        reranked_dicts = reranked_dicts[:8] if reranked_dicts else []

        context_chunks = [ContentChunk(**rd) for rd in reranked_dicts]
        rerank_time = int((time.perf_counter() - rerank_start) * 1000)

        if not context_chunks:
            prompt = (
                f"The user asked: '{query}' regarding repository {repository_id}.\n"
                f"However, search returned no relevant code chunks in the repository.\n"
                f"State clearly that no matching code was found in this repository."
            )
        else:
            prompt = CitationService.build_prompt_context(query, context_chunks, scope_text, citation_type="code")

        if history:
            history_text = "\n".join([f"{msg['role'].capitalize()}: {msg['content']}" for msg in history])
            prompt = f"Previous conversation context:\n{history_text}\n\n{prompt}"

        prompt_tokens = int(len(prompt.split()) * 1.3)
        diagnostics = Diagnostics(
            intent=f"code_{mode}",
            intentClassificationTimeMs=0,
            embeddingGenerated=True,
            embeddingModel=settings.embedding_model,
            embeddingDimensions=settings.embedding_dimensions,
            embeddingTimeMs=0,
            vectorSearchPerformed=True,
            vectorSearchResults=len(matches),
            vectorSearchTimeMs=search_time,
            rerankerUsed=len(matches) > 0,
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
        mode = kwargs.get("mode", "explain")
        prompt, context_chunks, diagnostics = await self._prepare(query, user_id, **kwargs)

        llm_start = time.perf_counter()
        response = await self.provider.generate_text(
            prompt,
            system_instruction=self._code_system_instruction(mode)
        )
        llm_time = int((time.perf_counter() - llm_start) * 1000)

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
        mode = kwargs.get("mode", "explain")
        prompt, context_chunks, diagnostics = await self._prepare(query, user_id, **kwargs)

        gen = self.provider.stream_text(
            prompt,
            system_instruction=self._code_system_instruction(mode)
        )
        return diagnostics, gen, context_chunks

    def _build_explain_prompt(self, target_label: str, context_text: str, question: str, history_text: str) -> str:
        return (
            f"{history_text}"
            f"You are analyzing a specific target within this repository: {target_label}.\n\n"
            "=== REPOSITORY CONTEXT (ground truth — do not contradict it) ===\n"
            f"{context_text}\n"
            "=== END CONTEXT ===\n\n"
            f"Task: {question}\n"
            "Ground every statement in the context above. Cite file paths and line ranges. "
            "If something is not shown in the context, say so instead of guessing."
        )

    async def explain(
        self,
        *,
        target_label: str,
        context_text: str,
        question: str,
        user_id: str,
        repository_id: str,
        mode: str = "explain",
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """Explain an explicitly-provided target (file, folder outline, or symbol).

        Unlike execute()/stream(), this does not run vector retrieval — the caller has already
        gathered the exact source to reason over, which is ideal for "explain this file/symbol".
        """
        started_at = time.perf_counter()

        history_text = ""
        if session_id:
            try:
                raw_history = await asyncio.to_thread(MemoryService.get_history, session_id, 6)
                if raw_history:
                    history_text = "Previous conversation context:\n" + "\n".join(
                        f"{m['role'].capitalize()}: {m['content']}" for m in raw_history
                    ) + "\n\n"
            except Exception:
                history_text = ""

        prompt = self._build_explain_prompt(target_label, context_text, question, history_text)

        llm_start = time.perf_counter()
        response = await self.provider.generate_text(
            prompt,
            system_instruction=self._code_system_instruction(mode),
        )
        llm_time = int((time.perf_counter() - llm_start) * 1000)

        diagnostics = Diagnostics(
            intent=f"code_explain_{mode}",
            intentClassificationTimeMs=0,
            embeddingGenerated=False,
            embeddingModel=None,
            embeddingDimensions=None,
            embeddingTimeMs=0,
            vectorSearchPerformed=False,
            vectorSearchResults=0,
            vectorSearchTimeMs=0,
            rerankerUsed=False,
            rerankerTimeMs=0,
            llmPromptTokens=response.prompt_tokens,
            llmCompletionTokens=response.completion_tokens,
            llmTimeMs=llm_time,
            totalTimeMs=int((time.perf_counter() - started_at) * 1000),
            contextChunks=[],
            toolCalls=[],
        )

        return {"answer": response.text, "diagnostics": diagnostics}
