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
    print("Testing gemini client embedding...")
    client = genai.Client(api_key=settings.gemini_api_key)
    try:
        kwargs = dict(
            model=settings.embedding_model,
            contents="hello world",
            config=types.EmbedContentConfig(output_dimensionality=settings.embedding_dimensions),
        )
        print("Calling embed_content with args:", kwargs)
        result = client.models.embed_content(**kwargs)
        print("Success! Result type:", type(result))
        print("Result dir:", dir(result))
        
        # Test extraction
        embeddings = getattr(result, "embeddings", None)
        print("getattr(result, 'embeddings') =", type(embeddings))
        
        if embeddings is None and isinstance(result, dict):
            embeddings = result.get("embeddings") or result.get("embedding")
            
        print("embeddings truthiness:", bool(embeddings))
        if not embeddings:
            print("ValueError would be raised here: 'Gemini embedding response did not include embeddings'")
            return
            
        first = embeddings[0] if isinstance(embeddings, list) else embeddings
        print("first type:", type(first))
        print("first dir:", dir(first))
        
        values = getattr(first, "values", None)
        if values is None and isinstance(first, dict):
            values = first.get("values") or first.get("embedding")
            
        print("values type:", type(values))
        if not values:
            print("ValueError would be raised here: 'Gemini embedding response did not include values'")
            return
            
        print("Final dimension:", len(values))
        
    except Exception as e:
        print("Exception thrown!!!")
        import traceback
        traceback.print_exc()

test_embed()
