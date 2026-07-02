import os
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


_HERE = Path(__file__).resolve().parent
_CANDIDATE_ENV_FILES = [
    _HERE.parent / ".env",   # dev: backend/../.env
    _HERE / ".env",           # Docker: /app/.env (if mounted)
]
ENV_FILE = next((p for p in _CANDIDATE_ENV_FILES if p.is_file()), _CANDIDATE_ENV_FILES[0])


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY")
    )
    supabase_publishable_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY")
    )
    gemini_api_key: str
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    default_provider: str = "gemini"

    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768
    llm_model: str = "gemini-2.0-flash"
    supabase_timeout_seconds: float = 20.0
    storage_timeout_seconds: float = 120.0
    embedding_timeout_seconds: float = 45.0
    llm_timeout_seconds: float = 120.0
    max_retry_attempts: int = 3
    embedding_concurrency: int = 5
    ingestion_concurrency: int = 2
    max_document_bytes: int = 157_286_400
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        description="Comma separated list of allowed origins"
    )

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def allowed_origins(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

settings = Settings()
