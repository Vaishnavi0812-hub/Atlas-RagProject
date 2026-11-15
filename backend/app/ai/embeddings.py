"""Embedding providers.

Everything outside this module depends only on `EmbeddingProvider`, so the
model or vendor can change through configuration without touching the
ingestion or retrieval code.
"""

import asyncio
import hashlib
import logging
import math
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import lru_cache

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingError(RuntimeError):
    """Raised with a user-presentable message when embeddings cannot be produced."""


@dataclass
class EmbeddingResult:
    vectors: list[list[float]]
    token_count: int | None = None


class EmbeddingProvider(ABC):
    name: str
    model: str
    dimensions: int

    @property
    def identifier(self) -> str:
        """Stored with each document so we know which model produced its vectors."""
        return f"{self.name}:{self.model}:{self.dimensions}"

    @abstractmethod
    async def embed_documents(self, texts: list[str]) -> EmbeddingResult: ...

    @abstractmethod
    async def embed_query(self, text: str) -> list[float]: ...


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vector))
    return [v / norm for v in vector] if norm else vector


class GeminiEmbeddingProvider(EmbeddingProvider):
    name = "gemini"
    MAX_BATCH = 100  # API limit per request
    RETRYABLE = {429, 500, 502, 503, 504}

    def __init__(self, api_key: str, model: str, dimensions: int, batch_size: int):
        if not api_key:
            raise EmbeddingError(
                "GEMINI_API_KEY is not configured. Add it to .env and restart the worker."
            )
        from google import genai  # imported lazily so tests don't need it

        self._client = genai.Client(api_key=api_key)
        self.model = model
        self.dimensions = dimensions
        self.batch_size = min(batch_size, self.MAX_BATCH)

    async def _call(self, texts: list[str], task_type: str):
        from google.genai import errors, types

        config = types.EmbedContentConfig(task_type=task_type, output_dimensionality=self.dimensions)
        delay = 2.0
        for attempt in range(1, 6):
            try:
                return await self._client.aio.models.embed_content(
                    model=self.model, contents=texts, config=config
                )
            except errors.APIError as exc:
                code = getattr(exc, "code", None)
                if code in self.RETRYABLE and attempt < 5:
                    logger.warning("Gemini embedding %s (attempt %s); retrying in %.0fs", code, attempt, delay)
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 30)
                    continue
                if code in (400, 401, 403):
                    raise EmbeddingError(f"Gemini rejected the embedding request ({code}): {exc.message}") from exc
                raise EmbeddingError(f"Gemini embedding request failed ({code}).") from exc
        raise EmbeddingError("Gemini embedding request failed after retries.")

    async def embed_documents(self, texts: list[str]) -> EmbeddingResult:
        vectors: list[list[float]] = []
        tokens = 0
        for i in range(0, len(texts), self.batch_size):
            response = await self._call(texts[i : i + self.batch_size], "RETRIEVAL_DOCUMENT")
            # Truncated-dimension Gemini embeddings must be re-normalised.
            vectors.extend(_normalize(list(e.values)) for e in response.embeddings)
            usage = getattr(response, "usage_metadata", None)
            tokens += getattr(usage, "total_token_count", 0) or 0 if usage else 0
        return EmbeddingResult(vectors=vectors, token_count=tokens or None)

    async def embed_query(self, text: str) -> list[float]:
        response = await self._call([text], "RETRIEVAL_QUERY")
        return _normalize(list(response.embeddings[0].values))


class HashEmbeddingProvider(EmbeddingProvider):
    """Deterministic feature-hashing embeddings (unigrams + bigrams).

    Not semantic in the way a neural model is, but lexically meaningful and
    fully offline, which makes it suitable for automated tests and for running
    the pipeline without an API key. Never selected unless configured.
    """

    name = "hash"
    model = "feature-hash-v1"
    _token = re.compile(r"[a-z0-9]+")

    def __init__(self, dimensions: int):
        self.dimensions = dimensions

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        words = self._token.findall(text.lower())
        features = words + [f"{a}_{b}" for a, b in zip(words, words[1:])]
        for feature in features:
            digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
            index = int.from_bytes(digest[:4], "little") % self.dimensions
            sign = 1.0 if digest[4] & 1 else -1.0
            vector[index] += sign
        return _normalize(vector)

    async def embed_documents(self, texts: list[str]) -> EmbeddingResult:
        return EmbeddingResult(vectors=[self._embed(t) for t in texts], token_count=None)

    async def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    provider = settings.embedding_provider.lower()
    if provider == "gemini":
        return GeminiEmbeddingProvider(
            api_key=settings.gemini_api_key,
            model=settings.embedding_model,
            dimensions=settings.embedding_dimensions,
            batch_size=settings.embedding_batch_size,
        )
    if provider == "hash":
        return HashEmbeddingProvider(dimensions=settings.embedding_dimensions)
    raise EmbeddingError(f"Unknown embedding provider '{settings.embedding_provider}'.")
