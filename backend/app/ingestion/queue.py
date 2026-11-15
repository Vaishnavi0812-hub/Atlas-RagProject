"""Background job queue (arq on Redis).

The API only enqueues a job id; the worker process loads everything else from
PostgreSQL, so jobs survive API restarts and can be retried safely.
"""

import uuid
from typing import Protocol

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from app.core.config import settings

INGEST_FUNCTION = "process_document"

_pool: ArqRedis | None = None


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(settings.redis_url)


class JobQueue(Protocol):
    async def enqueue_ingestion(self, job_id: uuid.UUID) -> None: ...


class ArqJobQueue:
    async def enqueue_ingestion(self, job_id: uuid.UUID) -> None:
        global _pool
        if _pool is None:
            _pool = await create_pool(redis_settings())
        # A deterministic arq job id makes double-enqueueing the same job a no-op.
        await _pool.enqueue_job(INGEST_FUNCTION, str(job_id), _job_id=f"ingest:{job_id}")


async def close_queue() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


def get_job_queue() -> JobQueue:
    """FastAPI dependency (overridden in tests to run jobs inline)."""
    return ArqJobQueue()
