import tiktoken
from typing import List

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """
    Splits text into overlapping chunks. 
    Currently using simple character/word splitting combined with token limits as best effort.
    """
    # For a robust production build, LangChain's RecursiveCharacterTextSplitter is ideal.
    # We will use a fast tiktoken-based chunker here.
    
    try:
        enc = tiktoken.get_encoding("cl100k_base")
    except Exception:
        # Fallback if tiktoken fails
        import re
        words = re.split(r'\s+', text)
        chunks = []
        i = 0
        while i < len(words):
            chunk = " ".join(words[i:i+chunk_size])
            chunks.append(chunk)
            i += (chunk_size - overlap)
        return chunks

    tokens = enc.encode(text)
    chunks = []
    i = 0
    while i < len(tokens):
        chunk_tokens = tokens[i:i + chunk_size]
        chunk_text = enc.decode(chunk_tokens)
        chunks.append(chunk_text)
        i += (chunk_size - overlap)
    
    return chunks
