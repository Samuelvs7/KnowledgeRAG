from models.schemas import ContentChunk

class CitationService:
    @staticmethod
    def build_prompt_context(query: str, context_chunks: list[ContentChunk], scope_text: str, citation_type: str = "document") -> str:
        if citation_type == "document":
            return CitationService._build_document_context(query, context_chunks, scope_text)
        elif citation_type == "code":
            return CitationService._build_code_context(query, context_chunks, scope_text)
        elif citation_type == "database":
            return CitationService._build_database_context(query, context_chunks, scope_text)
        elif citation_type == "financial":
            return CitationService._build_financial_context(query, context_chunks, scope_text)
        elif citation_type == "research":
            return CitationService._build_research_context(query, context_chunks, scope_text)
        else:
            return CitationService._build_document_context(query, context_chunks, scope_text)

    @staticmethod
    def _build_document_context(query: str, context_chunks: list[ContentChunk], scope_text: str) -> str:
        if not context_chunks:
            context_text = "No matching document chunks were found for this query."
        else:
            sections = []
            for index, chunk in enumerate(context_chunks, start=1):
                metadata = chunk.metadata or {}
                # Include offsets if available for frontend highlighting
                offset_info = ""
                if "offset" in metadata:
                    offset_info = f" | Offset: {metadata['offset']}"
                    
                sections.append(
                    "\n".join([
                        f"[{index}] Source: {chunk.source}",
                        f"Document ID: {metadata.get('document_id')}{offset_info}",
                        f"Similarity: {chunk.similarity:.4f}",
                        "Content:",
                        chunk.content,
                    ])
                )
            context_text = "\n\n".join(sections)

        return (
            "You are answering a KnowledgeRAG document question. Use only the provided context. "
            "When an answer uses a chunk, cite it with its bracketed source number like [1]. "
            "If the context does not contain the answer, say you could not find the answer in the uploaded documents.\n\n"
            f"Scope: {scope_text}\n\n"
            f"Context:\n{context_text}\n\n"
            f"Question: {query}\n\n"
            "Answer:"
        )

    @staticmethod
    def _build_code_context(query: str, context_chunks: list[ContentChunk], scope_text: str) -> str:
        # Scaffold formatting for code chunks
        return CitationService._build_document_context(query, context_chunks, scope_text)

    @staticmethod
    def _build_database_context(query: str, context_chunks: list[ContentChunk], scope_text: str) -> str:
        # Scaffold formatting for database chunks
        return CitationService._build_document_context(query, context_chunks, scope_text)

    @staticmethod
    def _build_financial_context(query: str, context_chunks: list[ContentChunk], scope_text: str) -> str:
        # Scaffold formatting for financial chunks
        return CitationService._build_document_context(query, context_chunks, scope_text)

    @staticmethod
    def _build_research_context(query: str, context_chunks: list[ContentChunk], scope_text: str) -> str:
        # Scaffold formatting for research chunks
        return CitationService._build_document_context(query, context_chunks, scope_text)

