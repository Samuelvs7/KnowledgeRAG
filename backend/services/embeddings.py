import google.generativeai as genai
from config import settings

def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for a list of text chunks using Gemini text-embedding-004.
    Matches the 768 dimensions expected by Supabase pgvector.
    """
    model = 'models/text-embedding-004'
    result = genai.embed_content(
        model=model,
        content=texts,
        task_type="retrieval_document",
    )
    return result['embedding']

def get_query_embedding(query: str) -> list[float]:
    model = 'models/text-embedding-004'
    result = genai.embed_content(
        model=model,
        content=query,
        task_type="retrieval_query",
    )
    return result['embedding']
