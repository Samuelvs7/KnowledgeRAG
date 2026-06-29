import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any

import tiktoken

from services.text_extractor import ExtractedSegment


@dataclass(frozen=True)
class DocumentChunk:
    content: str
    chunk_index: int
    metadata: dict[str, Any]


class _WhitespaceTokenEncoder:
    def encode(self, text: str) -> list[str]:
        return text.split()

    def decode(self, tokens: list[str]) -> str:
        return " ".join(tokens)


# ---------------------------------------------------------------------------
# Boundary detection helpers
# ---------------------------------------------------------------------------

_HEADING_RE = re.compile(r"^#{1,6}\s", re.MULTILINE)
_TABLE_ROW_RE = re.compile(r"^\|.*\|$", re.MULTILINE)
_CODE_FENCE_RE = re.compile(r"^```", re.MULTILINE)


def _split_by_semantic_boundaries(text: str) -> list[dict[str, Any]]:
    """Split text into semantic segments by headings, code fences, and table blocks."""
    lines = text.split("\n")
    segments: list[dict[str, Any]] = []
    current_lines: list[str] = []
    current_type = "text"
    in_code_block = False

    def flush() -> None:
        nonlocal current_lines, current_type
        body = "\n".join(current_lines).strip()
        if body:
            segments.append({"text": body, "type": current_type})
        current_lines = []
        current_type = "text"

    for line in lines:
        stripped = line.strip()

        # Code fence toggle
        if _CODE_FENCE_RE.match(stripped):
            if in_code_block:
                current_lines.append(line)
                in_code_block = False
                flush()
                continue
            else:
                flush()
                in_code_block = True
                current_type = "code"
                current_lines.append(line)
                continue

        if in_code_block:
            current_lines.append(line)
            continue

        # Heading boundary
        if _HEADING_RE.match(stripped):
            flush()
            current_type = "heading"
            current_lines.append(line)
            flush()
            continue

        # Table row
        if _TABLE_ROW_RE.match(stripped):
            if current_type != "table":
                flush()
                current_type = "table"
            current_lines.append(line)
            continue

        # Normal text
        if current_type == "table":
            flush()
        current_lines.append(line)

    flush()
    return segments


# ---------------------------------------------------------------------------
# Main chunking entrypoint
# ---------------------------------------------------------------------------

def iter_document_chunks(
    segments: Iterable[ExtractedSegment],
    *,
    document_id: str,
    title: str,
    source_path: str,
    collection_ids: list[str],
    chunk_size: int = 500,
    overlap: int = 50,
) -> Iterator[DocumentChunk]:
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("Chunk overlap must be non-negative and smaller than chunk size")

    encoder = _get_token_encoder()
    chunk_index = 0

    for segment in segments:
        # Split each extracted segment into semantic sub-segments
        semantic_segments = _split_by_semantic_boundaries(segment.text)

        buffer_tokens: list[str] = []
        buffer_text_parts: list[str] = []

        def emit_chunk(tokens: list[str], text_parts: list[str]) -> int:
            nonlocal chunk_index
            content = encoder.decode(tokens).strip() if hasattr(encoder, 'decode') and not isinstance(encoder, _WhitespaceTokenEncoder) else " ".join(text_parts).strip()
            # Prefer joining the original text parts for fidelity
            content = "\n\n".join(text_parts).strip()
            if not content:
                return chunk_index
            char_offset = segment.text.find(content[: min(64, len(content))])
            yield_chunk = DocumentChunk(
                content=content,
                chunk_index=chunk_index,
                metadata={
                    "document_id": document_id,
                    "document_title": title,
                    "page": segment.page,
                    "section": segment.section,
                    "chunk_index": chunk_index,
                    "offset": max(0, char_offset),
                    "token_offset": 0,
                    "token_count": len(tokens),
                    "collection_ids": collection_ids,
                    "source_path": source_path,
                },
            )
            chunk_index += 1
            return yield_chunk  # type: ignore[return-value]

        for ss in semantic_segments:
            ss_text = ss["text"]
            ss_tokens = encoder.encode(ss_text)

            # If this single semantic segment exceeds chunk_size, split it with token windowing
            if len(ss_tokens) > chunk_size:
                # Flush buffer first
                if buffer_tokens:
                    result = emit_chunk(buffer_tokens, buffer_text_parts)
                    if isinstance(result, DocumentChunk):
                        yield result
                    buffer_tokens = []
                    buffer_text_parts = []

                # Token-window split for oversized segment
                token_offset = 0
                while token_offset < len(ss_tokens):
                    token_slice = ss_tokens[token_offset:token_offset + chunk_size]
                    content = encoder.decode(token_slice).strip() if hasattr(encoder, 'decode') else " ".join(token_slice).strip()
                    if content:
                        char_offset = segment.text.find(content[: min(64, len(content))])
                        yield DocumentChunk(
                            content=content,
                            chunk_index=chunk_index,
                            metadata={
                                "document_id": document_id,
                                "document_title": title,
                                "page": segment.page,
                                "section": segment.section,
                                "chunk_index": chunk_index,
                                "offset": max(0, char_offset),
                                "token_offset": token_offset,
                                "token_count": len(token_slice),
                                "collection_ids": collection_ids,
                                "source_path": source_path,
                                "segment_type": ss["type"],
                            },
                        )
                        chunk_index += 1
                    token_offset += chunk_size - overlap
                continue

            # If adding this segment would exceed the chunk size, flush
            if len(buffer_tokens) + len(ss_tokens) > chunk_size and buffer_tokens:
                result = emit_chunk(buffer_tokens, buffer_text_parts)
                if isinstance(result, DocumentChunk):
                    yield result
                # Keep overlap tokens
                if overlap > 0 and len(buffer_tokens) > overlap:
                    buffer_tokens = buffer_tokens[-overlap:]
                    buffer_text_parts = [encoder.decode(buffer_tokens).strip() if hasattr(encoder, 'decode') else " ".join(buffer_tokens).strip()]
                else:
                    buffer_tokens = []
                    buffer_text_parts = []

            buffer_tokens.extend(ss_tokens)
            buffer_text_parts.append(ss_text)

        # Flush remaining buffer for this segment
        if buffer_tokens:
            result = emit_chunk(buffer_tokens, buffer_text_parts)
            if isinstance(result, DocumentChunk):
                yield result
            buffer_tokens = []
            buffer_text_parts = []


def _get_token_encoder():
    try:
        return tiktoken.get_encoding("cl100k_base")
    except Exception:
        return _WhitespaceTokenEncoder()


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    segments = [ExtractedSegment(text=text)]
    return [
        chunk.content
        for chunk in iter_document_chunks(
            segments,
            document_id="compatibility",
            title="Untitled",
            source_path="",
            collection_ids=[],
            chunk_size=chunk_size,
            overlap=overlap,
        )
    ]

