"""
Complete diagnostic script for the KnowledgeRAG ingestion pipeline.
Run from backend/ directory:  python diagnose.py
"""
import asyncio
import inspect
import os
import sys
import traceback

os.chdir(os.path.dirname(os.path.abspath(__file__)))


def section(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def mask(value: str | None, keep: int = 8) -> str:
    if not value:
        return "missing"
    return f"{value[:keep]}..."


section("STEP 1: Environment Variables")
try:
    from config import settings

    print(f"[OK] SUPABASE_URL          = {mask(settings.supabase_url, 40)}")
    print(f"[OK] SUPABASE_KEY          = {mask(settings.supabase_service_role_key, 12)}")
    print(f"[OK] GEMINI_API_KEY        = {mask(settings.gemini_api_key, 8)}")
    print(f"[OK] HUGGINGFACE_API_KEY   = {'configured' if settings.huggingface_api_key else 'missing'}")
    print(f"[OK] Embedding provider    = {settings.embedding_provider}")
    print(f"[OK] Embedding model       = {settings.embedding_model}")
    print(f"[OK] Embedding dimensions  = {settings.embedding_dimensions}")
    print(f"[OK] LLM model             = {settings.llm_model}")
    print(f"[OK] LLM provider          = {settings.llm_provider}")
except Exception:
    print("[FAILED] Could not load settings")
    traceback.print_exc()
    sys.exit(1)


section("STEP 2: Gemini SDK Verification for Chat/QA")
try:
    import google.genai as genai_pkg
    from google import genai
    from google.genai import types

    print(f"[OK] google-genai package version: {getattr(genai_pkg, '__version__', 'unknown')}")
    print("[OK] genai module imported")
    print("[OK] Gemini GenerateContentConfig available:", hasattr(types, "GenerateContentConfig"))
    client = genai.Client(api_key=settings.gemini_api_key)
    print(f"[OK] Gemini client created for chat model {settings.llm_model}")
except Exception:
    print("[FAILED] Gemini chat SDK verification failed")
    traceback.print_exc()
    sys.exit(1)


section("STEP 3: Shared Embedding Interface")
try:
    from services.embeddings import embed_text

    async def test_shared_embedding() -> list[float]:
        print(f"[START] embed_text via provider={settings.embedding_provider} model={settings.embedding_model}")
        embedding = await embed_text("Hello world", title="Diagnostic")
        print(f"[OK] embed_text returned {len(embedding)} dimensions")
        print(f"[OK] First 5 values: {embedding[:5]}")
        return embedding

    values = asyncio.run(test_shared_embedding())
    if len(values) != settings.embedding_dimensions:
        raise RuntimeError(
            f"Dimension mismatch: expected {settings.embedding_dimensions}, got {len(values)}"
        )
    print(f"[OK] Dimensions match: {settings.embedding_dimensions}")
except Exception:
    print("[FAILED] Shared embedding interface failed")
    traceback.print_exc()
    sys.exit(1)


section("STEP 4: ModelRouter Embedding Interface")
try:
    from services.ai.router import ModelRouter

    provider = ModelRouter.get_provider()
    print(f"[OK] ModelRouter.get_provider() = {provider.__class__.__name__}")

    async def test_router_embedding() -> None:
        embedding = await provider.embed_text("Router test", title="Diagnostic")
        print(f"[OK] Provider embed_text delegated to shared embeddings: {len(embedding)} dims")

    asyncio.run(test_router_embedding())
except Exception:
    print("[FAILED] ModelRouter embedding interface failed")
    traceback.print_exc()
    sys.exit(1)


section("STEP 5: Supabase Database Connectivity")
try:
    from database import supabase

    result = supabase.table("documents").select("id").limit(1).execute()
    print(f"[OK] Supabase documents table accessible. Rows returned: {len(result.data or [])}")
except Exception:
    print("[FAILED] Supabase connectivity test failed")
    traceback.print_exc()


section("STEP 6: Staging Table")
try:
    result = supabase.table("document_chunk_staging").select("job_id").limit(1).execute()
    print("[OK] document_chunk_staging table accessible")
except Exception:
    print("[FAILED] document_chunk_staging table test failed")
    traceback.print_exc()


section("STEP 7: Vector Store Functions")
try:
    from services.vector_store import finalize_document_chunks, insert_staging_chunks

    print("[OK] insert_staging_chunks imported")
    print("[OK] finalize_document_chunks imported")
    print(f"[OK] insert_staging_chunks signature: {inspect.signature(insert_staging_chunks)}")
    print(f"[OK] finalize_document_chunks signature: {inspect.signature(finalize_document_chunks)}")
except Exception:
    print("[FAILED] vector_store import failed")
    traceback.print_exc()


section("STEP 8: Retry Module")
try:
    from services.retry import is_transient_error, with_retry

    print("[OK] retry module imported")
    print(f"[OK] with_retry signature: {inspect.signature(with_retry)}")
    print(f"[OK] 401 transient? {is_transient_error(Exception('401 authentication failed'))}")
    print(f"[OK] 503 transient? {is_transient_error(Exception('503 server unavailable'))}")
except Exception:
    print("[FAILED] retry module test failed")
    traceback.print_exc()


print(f"\n{'=' * 60}")
print("  DIAGNOSTIC COMPLETE")
print(f"{'=' * 60}")
