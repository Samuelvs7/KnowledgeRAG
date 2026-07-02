import os
import sys

# Load env
from dotenv import load_dotenv
load_dotenv('e:/Projects/KnowledgeRAG/.env')

sys.path.append('e:/Projects/KnowledgeRAG/backend')
from config import settings
from google import genai
from google.genai import types

def test_embed():
    print("Testing gemini client...")
    client = genai.Client(api_key=settings.gemini_api_key)
    try:
        result = client.models.embed_content(
            model=settings.embedding_model,
            contents="hello world",
            config=types.EmbedContentConfig(output_dimensionality=settings.embedding_dimensions),
        )
        print("Success! Got result:", result)
        
        # Test my extract logic
        embeddings = getattr(result, "embeddings", None)
        if embeddings is None and isinstance(result, dict):
            embeddings = result.get("embeddings") or result.get("embedding")
        first = embeddings[0] if isinstance(embeddings, list) else embeddings
        values = getattr(first, "values", None)
        print("Values length:", len(values))
        
    except Exception as e:
        print("Exception thrown!!!")
        import traceback
        traceback.print_exc()

test_embed()
