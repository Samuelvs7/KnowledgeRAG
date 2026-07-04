import os
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic import model_validator
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
    groq_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    llm_provider: str = Field(
        default="gemini",
        validation_alias=AliasChoices("LLM_PROVIDER", "DEFAULT_PROVIDER")
    )

    embedding_provider: Literal["gemini", "huggingface"] = "gemini"
    huggingface_api_key: str | None = None
    gemini_embedding_model: str = Field(
        default="gemini-embedding-001",
        validation_alias=AliasChoices("GEMINI_EMBEDDING_MODEL", "EMBEDDING_MODEL"),
    )
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

    @model_validator(mode="after")
    def validate_embedding_settings(self) -> "Settings":
        if self.embedding_provider == "huggingface" and not self.huggingface_api_key:
            raise ValueError(
                "HUGGINGFACE_API_KEY is required when EMBEDDING_PROVIDER=huggingface"
            )
        return self

    @property
    def embedding_model(self) -> str:
        if self.embedding_provider == "huggingface":
            return "BAAI/bge-small-en-v1.5"
        return self.gemini_embedding_model

    @property
    def allowed_origins(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

settings = Settings()
