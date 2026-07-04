import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
sys.path.append(str(ROOT / "backend"))

from config import settings  # noqa: E402
from services.embeddings import embed_text  # noqa: E402


async def main() -> None:
    print(
        "Testing shared embedding provider:",
        settings.embedding_provider,
        settings.embedding_model,
    )
    embedding = await embed_text("hello world", title="Smoke Test")
    print("Embedding dimensions:", len(embedding))
    if len(embedding) != settings.embedding_dimensions:
        raise RuntimeError(
            f"Expected {settings.embedding_dimensions} dimensions, got {len(embedding)}"
        )


asyncio.run(main())
