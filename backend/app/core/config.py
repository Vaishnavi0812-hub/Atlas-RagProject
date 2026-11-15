"""Application settings, loaded from environment variables.

All infrastructure endpoints and AI-provider choices are configurable so the
stack can run in Docker, locally, or against managed services without code
changes.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Application ---
    app_name: str = "ATLAS"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/api/v1"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5180", "http://127.0.0.1:5180"]
    )

    # --- Security ---
    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    bcrypt_rounds: int = 12
    session_cookie_name: str = "atlas_session"
    invitation_expire_days: int = 7
    frontend_url: str = "http://localhost:5180"
    # Login throttling: attempts allowed per window, per email+IP.
    login_rate_limit: int = 10
    login_rate_window_seconds: int = 15 * 60

    # --- PostgreSQL ---
    database_url: str = "postgresql+asyncpg://atlas:atlas_dev_password@localhost:5442/atlas"

    # --- Neo4j ---
    neo4j_uri: str = "bolt://localhost:7688"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "atlas_dev_password"

    # --- Qdrant ---
    qdrant_url: str = "http://localhost:6335"
    qdrant_collection: str = "atlas_chunks"

    # --- Redis ---
    redis_url: str = "redis://localhost:6380/0"

    # --- File storage ---
    storage_dir: str = "./storage"
    max_upload_mb: int = 50
    max_files_per_upload: int = 20

    # --- Ingestion ---
    default_chunk_size: int = 1200  # characters
    default_chunk_overlap: int = 200  # characters
    embedding_batch_size: int = 64
    ingestion_job_timeout_seconds: int = 30 * 60
    worker_max_jobs: int = 4

    # --- AI providers ---
    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.5-flash"
    gemini_api_key: str = ""
    # "gemini" in normal use; "hash" is an offline, deterministic provider used
    # by the test suite (no network, no API key).
    embedding_provider: str = "gemini"
    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.startswith("["):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
