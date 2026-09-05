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
        if not context_chunks:
            context_text = "No matching code chunks were found for this query in the repository."
        else:
            sections = []
            for index, chunk in enumerate(context_chunks, start=1):
                metadata = chunk.metadata or {}
                file_path = metadata.get("file_path") or chunk.source
                lang = metadata.get("language", "code")
                symbol_name = metadata.get("symbol_name")
                symbol_type = metadata.get("symbol_type")
                
                sym_str = f" | Symbol: {symbol_type} {symbol_name}" if symbol_name else ""
                
                sections.append(
                    "\n".join([
                        f"[{index}] Source File: {file_path}{sym_str}",
                        f"Language: {lang} | Similarity: {chunk.similarity:.4f}",
                        "Code Content:",
                        f"```{lang}",
                        chunk.content,
                        "```",
                    ])
                )
            context_text = "\n\n".join(sections)

        return (
            "You are answering a KnowledgeRAG Repository Intelligence question. "
            "Use the retrieved repository code context as your primary source of truth. "
            "When referencing code, cite the source file and line range using bracketed numbers like [1]. "
            "Distinguish clearly between observed repository facts and AI inferences. "
            "If the context does not contain enough evidence, clearly state what information is missing.\n\n"
            f"Repository Scope: {scope_text}\n\n"
            f"Retrieved Code Context:\n{context_text}\n\n"
            f"Developer Request: {query}\n\n"
            "Response:"
        )

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

