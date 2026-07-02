"""
Complete diagnostic script for the KnowledgeRAG ingestion pipeline.
Run from backend/ directory:  python diagnose.py
"""
import sys
import os
import traceback

os.chdir(os.path.dirname(os.path.abspath(__file__)))

def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

# ── STEP 4: Verify environment variables ──────────────────────
section("STEP 4: Environment Variables")
try:
    from config import settings
    print(f"[OK] SUPABASE_URL        = {settings.supabase_url[:40]}...")
    print(f"[OK] SUPABASE_KEY        = {settings.supabase_service_role_key[:15]}...")
    print(f"[OK] GEMINI_API_KEY      = {settings.gemini_api_key[:15]}...")
    print(f"[OK] Embedding model     = {settings.embedding_model}")
    print(f"[OK] Embedding dims      = {settings.embedding_dimensions}")
    print(f"[OK] LLM model           = {settings.llm_model}")
    print(f"[OK] Default provider    = {settings.default_provider}")
except Exception:
    print("[FAILED] Could not load settings")
    traceback.print_exc()
    sys.exit(1)

# ── STEP 5: Verify Gemini SDK ──────────────────────────────────
section("STEP 5: Gemini SDK Verification")
try:
    import google.genai as genai_pkg
    print(f"[OK] google-genai package version: {getattr(genai_pkg, '__version__', 'unknown')}")
except Exception:
    print("[FAILED] google-genai not installed")
    traceback.print_exc()
    sys.exit(1)

try:
    from google import genai
    from google.genai import types
    print(f"[OK] genai module imported")
    print(f"[OK] types module imported")

    # Check EmbedContentConfig fields
    import inspect
    sig = inspect.signature(types.EmbedContentConfig.__init__)
    params = list(sig.parameters.keys())
    print(f"[OK] EmbedContentConfig params: {params}")
    has_output_dim = 'output_dimensionality' in params
    print(f"[INFO] Has output_dimensionality: {has_output_dim}")
except Exception:
    print("[FAILED] Could not inspect genai types")
    traceback.print_exc()
    sys.exit(1)

# ── Test embedding call ────────────────────────────────────────
section("STEP 5b: Live Gemini Embedding Test")
try:
    client = genai.Client(api_key=settings.gemini_api_key)
    print(f"[OK] Gemini client created")
    
    print(f"[START] Calling embed_content with model={settings.embedding_model}...")
    result = client.models.embed_content(
        model=settings.embedding_model,
        contents="Hello world",
        config=types.EmbedContentConfig(),
    )
    print(f"[OK] embed_content returned. Type: {type(result)}")
    print(f"[OK] Result attributes: {[a for a in dir(result) if not a.startswith('_')]}")
    
    embeddings = getattr(result, "embeddings", None)
    print(f"[OK] result.embeddings type: {type(embeddings)}")
    
    if embeddings is None:
        print(f"[WARN] result.embeddings is None, trying dict access...")
        if isinstance(result, dict):
            embeddings = result.get("embeddings") or result.get("embedding")
    
    if not embeddings:
        print(f"[FAILED] No embeddings in response!")
        print(f"[DEBUG] Full result repr: {repr(result)}")
        sys.exit(1)
    
    first = embeddings[0] if isinstance(embeddings, list) else embeddings
    print(f"[OK] First embedding type: {type(first)}")
    print(f"[OK] First embedding attrs: {[a for a in dir(first) if not a.startswith('_')]}")
    
    values = getattr(first, "values", None)
    if values is None and isinstance(first, dict):
        values = first.get("values") or first.get("embedding")
    
    if values is None:
        print(f"[FAILED] No values in embedding!")
        print(f"[DEBUG] First embedding repr: {repr(first)}")
        sys.exit(1)
    
    values_list = [float(v) for v in values]
    print(f"[OK] Embedding length: {len(values_list)}")
    print(f"[OK] First 5 values: {values_list[:5]}")
    
    if len(values_list) != settings.embedding_dimensions:
        print(f"[WARN] Dimension mismatch! Expected {settings.embedding_dimensions}, got {len(values_list)}")
    else:
        print(f"[OK] Dimensions match: {settings.embedding_dimensions}")
        
except Exception:
    print("[FAILED] Gemini embedding test failed!")
    traceback.print_exc()
    sys.exit(1)

# ── Test GeminiProvider class ──────────────────────────────────
section("STEP 5c: GeminiProvider Class Test")
try:
    from services.ai.providers.gemini import GeminiProvider
    provider = GeminiProvider()
    print(f"[OK] GeminiProvider instantiated")
    
    import asyncio
    
    async def test_provider():
        print(f"[START] provider.embed_text('Hello world')...")
        embedding = await provider.embed_text("Hello world", title="Test")
        print(f"[OK] embed_text returned {len(embedding)} dimensions")
        print(f"[OK] First 5: {embedding[:5]}")
        return embedding
    
    embedding = asyncio.run(test_provider())
    print(f"[OK] GeminiProvider.embed_text works!")
except Exception:
    print("[FAILED] GeminiProvider class test failed!")
    traceback.print_exc()
    sys.exit(1)

# ── Test ModelRouter ───────────────────────────────────────────
section("STEP 5d: ModelRouter Test")
try:
    from services.ai.router import ModelRouter
    provider = ModelRouter.get_provider()
    print(f"[OK] ModelRouter.get_provider() = {provider.__class__.__name__}")
    
    import asyncio
    
    async def test_router():
        embedding = await provider.embed_text("Router test", title="Test")
        print(f"[OK] ModelRouter embedding: {len(embedding)} dims")
        return embedding
    
    asyncio.run(test_router())
except Exception:
    print("[FAILED] ModelRouter test failed!")
    traceback.print_exc()
    sys.exit(1)

# ── Test Supabase connectivity ─────────────────────────────────
section("STEP 6a: Supabase Database Connectivity")
try:
    from database import supabase
    print(f"[OK] Supabase client created")
    
    # Test basic query
    result = supabase.table("documents").select("id").limit(1).execute()
    print(f"[OK] Supabase documents table accessible. Rows returned: {len(result.data or [])}")
except Exception:
    print("[FAILED] Supabase connectivity test failed!")
    traceback.print_exc()

# ── Test staging table ─────────────────────────────────────────
section("STEP 6b: Staging Table Test")
try:
    result = supabase.table("document_chunk_staging").select("job_id").limit(1).execute()
    print(f"[OK] document_chunk_staging table accessible")
except Exception:
    print("[FAILED] document_chunk_staging table test failed!")
    traceback.print_exc()

# ── Test vector_store functions ─────────────────────────────────
section("STEP 6c: Vector Store Functions")
try:
    from services.vector_store import insert_staging_chunks, finalize_document_chunks
    print(f"[OK] insert_staging_chunks imported")
    print(f"[OK] finalize_document_chunks imported")
    
    import inspect
    sig_insert = inspect.signature(insert_staging_chunks)
    sig_finalize = inspect.signature(finalize_document_chunks)
    print(f"[OK] insert_staging_chunks signature: {sig_insert}")
    print(f"[OK] finalize_document_chunks signature: {sig_finalize}")
except Exception:
    print("[FAILED] vector_store import failed!")
    traceback.print_exc()

# ── Test retry module ──────────────────────────────────────────
section("STEP 6d: Retry Module")
try:
    from services.retry import with_retry, is_transient_error
    print(f"[OK] retry module imported")
    
    import inspect
    sig = inspect.signature(with_retry)
    print(f"[OK] with_retry signature: {sig}")
except Exception:
    print("[FAILED] retry module test failed!")
    traceback.print_exc()

# ── Verify vector_store internals ──────────────────────────────
section("STEP 6e: Inspect vector_store.py source")
try:
    import services.vector_store as vs
    src = inspect.getsource(vs)
    print(f"[OK] vector_store.py source length: {len(src)} chars")
    
    # Check for common issues
    if "document_chunk_staging" in src:
        print(f"[OK] Uses document_chunk_staging table")
    if "finalize_document_chunks" in src:
        print(f"[OK] Has finalize_document_chunks function")
    if "rpc" in src.lower():
        print(f"[OK] Uses RPC calls")
    else:
        print(f"[WARN] No RPC calls found in vector_store.py")
except Exception:
    print("[FAILED] vector_store inspection failed!")
    traceback.print_exc()

print(f"\n{'='*60}")
print(f"  DIAGNOSTIC COMPLETE")
print(f"{'='*60}")
