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

    # --- AI providers ---
    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.5-flash"
    gemini_api_key: str = ""
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
