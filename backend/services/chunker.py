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
        tokens = encoder.encode(segment.text)
        token_offset = 0
        while token_offset < len(tokens):
            token_slice = tokens[token_offset:token_offset + chunk_size]
            content = encoder.decode(token_slice).strip()
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
                    },
                )
                chunk_index += 1
            token_offset += chunk_size - overlap


def _get_token_encoder():
    try:
        return tiktoken.get_encoding("cl100k_base")
    except Exception:
        # tiktoken may fetch encoder data on a cold machine. Keep ingestion usable
        # in restricted/offline environments rather than failing before parsing.
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
