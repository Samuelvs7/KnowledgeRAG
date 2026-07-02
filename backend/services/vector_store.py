import logging

from database import supabase
from services.chunker import DocumentChunk

logger = logging.getLogger(__name__)

def insert_document_chunks(document_id: str, chunks: list[str], embeddings: list[list[float]]):
    """Inserts text chunks and their embeddings into Supabase."""
    logger.info(
        "[STEP] vector_store.insert_document_chunks document_id=%s chunks=%s embeddings=%s",
        document_id,
        len(chunks),
        len(embeddings),
    )
    data_to_insert = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        data_to_insert.append({
            "document_id": document_id,
            "content": chunk,
            "embedding": embedding,
            "chunk_index": i
        })
    
    # We use supabase.table.insert() directly
    # Note: supabase inserts might be limited by payload size, so batching might be needed for huge files
    # We will do chunks of 100 for safety
    batch_size = 100
    for i in range(0, len(data_to_insert), batch_size):
        batch = data_to_insert[i:i+batch_size]
        logger.info("[START] Supabase insert document_chunks batch_start=%s batch_size=%s", i, len(batch))
        try:
            supabase.table("document_chunks").insert(batch).execute()
        except Exception:
            logger.exception("[FAILED] Supabase insert document_chunks failed document_id=%s", document_id)
            raise
        logger.info("[SUCCESS] Supabase insert document_chunks batch_start=%s inserted=%s", i, len(batch))

def insert_staging_chunks(job_id: str, document_id: str, chunks: list[DocumentChunk], embeddings: list[list[float]]):
    logger.info(
        "[STEP] vector_store.insert_staging_chunks document_id=%s job_id=%s chunks=%s embeddings=%s",
        document_id,
        job_id,
        len(chunks),
        len(embeddings),
    )
    data_to_insert = []
    for chunk, embedding in zip(chunks, embeddings):
        data_to_insert.append({
            "job_id": job_id,
            "document_id": document_id,
            "content": chunk.content,
            "embedding": embedding,
            "chunk_index": chunk.chunk_index,
            "metadata": chunk.metadata,
        })

    batch_size = 100
    for i in range(0, len(data_to_insert), batch_size):
        batch = data_to_insert[i:i+batch_size]
        logger.info(
            "[START] Supabase insert document_chunk_staging document_id=%s job_id=%s batch_start=%s batch_size=%s",
            document_id,
            job_id,
            i,
            len(batch),
        )
        try:
            supabase.table("document_chunk_staging").insert(batch).execute()
        except Exception:
            logger.exception(
                "[FAILED] Supabase insert document_chunk_staging failed document_id=%s job_id=%s",
                document_id,
                job_id,
            )
            raise
        logger.info(
            "[SUCCESS] Supabase insert document_chunk_staging document_id=%s job_id=%s batch_start=%s inserted=%s",
            document_id,
            job_id,
            i,
            len(batch),
        )


def finalize_document_chunks(document_id: str, job_id: str) -> int:
    logger.info("[STEP] vector_store.finalize_document_chunks document_id=%s job_id=%s", document_id, job_id)
    logger.info("[START] Supabase RPC finalize_document_chunks")
    try:
        response = supabase.rpc(
            "finalize_document_chunks",
            {"p_document_id": document_id, "p_job_id": job_id},
        ).execute()
    except Exception:
        logger.exception("[FAILED] Supabase RPC finalize_document_chunks failed document_id=%s job_id=%s", document_id, job_id)
        raise
    count = int(response.data or 0)
    logger.info("[SUCCESS] Supabase RPC finalize_document_chunks inserted_count=%s", count)
    return count


def search_documents(query_embedding: list[float], match_threshold: float = 0.5, match_count: int = 5):
    """Uses Supabase rpc match_documents for vector similarity search."""
    logger.info("[STEP] vector_store.search_documents embedding_length=%s", len(query_embedding))
    logger.info("[START] Supabase RPC match_documents")
    try:
        response = supabase.rpc(
            "match_documents",
            {
                "query_embedding": query_embedding,
                "match_threshold": match_threshold,
                "match_count": match_count
            }
        ).execute()
    except Exception:
        logger.exception("[FAILED] Supabase RPC match_documents failed")
        raise
    logger.info("[SUCCESS] Supabase RPC match_documents rows=%s", len(response.data or []))
    return response.data


def search_documents_scoped(
    query_embedding: list[float],
    *,
    user_id: str,
    document_id: str | None = None,
    collection_id: str | None = None,
    match_threshold: float = 0.3,
    match_count: int = 20,
):
    logger.info("[STEP] vector_store.search_documents_scoped user_id=%s embedding_length=%s", user_id, len(query_embedding))
    logger.info("[START] Supabase RPC match_documents_scoped")
    try:
        response = supabase.rpc(
            "match_documents_scoped",
            {
                "query_embedding": query_embedding,
                "p_user_id": user_id,
                "p_document_id": document_id,
                "p_collection_id": collection_id,
                "match_threshold": match_threshold,
                "match_count": match_count,
            },
        ).execute()
    except Exception:
        logger.exception("[FAILED] Supabase RPC match_documents_scoped failed user_id=%s", user_id)
        raise
    rows = response.data or []
    logger.info("[SUCCESS] Supabase RPC match_documents_scoped rows=%s", len(rows))
    return rows
