from database import supabase

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
