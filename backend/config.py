import os
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY")
    )
    supabase_publishable_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY")
    )
    gemini_api_key: str

    embedding_model: str = "text-embedding-004"
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
        default="http://localhost:5173", 
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
