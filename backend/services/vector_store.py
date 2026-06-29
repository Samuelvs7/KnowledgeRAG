from database import supabase
from services.chunker import DocumentChunk

def insert_document_chunks(document_id: str, chunks: list[str], embeddings: list[list[float]]):
    """Inserts text chunks and their embeddings into Supabase."""
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
        supabase.table("document_chunks").insert(batch).execute()

def insert_staging_chunks(job_id: str, document_id: str, chunks: list[DocumentChunk], embeddings: list[list[float]]):
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
        supabase.table("document_chunk_staging").insert(data_to_insert[i:i+batch_size]).execute()


def finalize_document_chunks(document_id: str, job_id: str) -> int:
    response = supabase.rpc(
        "finalize_document_chunks",
        {"p_document_id": document_id, "p_job_id": job_id},
    ).execute()
    return int(response.data or 0)


def search_documents(query_embedding: list[float], match_threshold: float = 0.5, match_count: int = 5):
    """Uses Supabase rpc match_documents for vector similarity search."""
    response = supabase.rpc(
        "match_documents",
        {
            "query_embedding": query_embedding,
            "match_threshold": match_threshold,
            "match_count": match_count
        }
    ).execute()
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
    return response.data or []
