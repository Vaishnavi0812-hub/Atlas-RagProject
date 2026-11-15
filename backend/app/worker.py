"""Background worker: `arq app.worker.WorkerSettings`."""

import logging
import uuid

from app.core.config import settings
from app.core.logging import configure_logging
from app.db.neo4j import close_neo4j
from app.db.qdrant import close_qdrant, ensure_collection
from app.db.session import engine
from app.ingestion.pipeline import process_document as run_pipeline
from app.ingestion.pipeline import recover_interrupted_jobs
from app.ingestion.queue import INGEST_FUNCTION, redis_settings

configure_logging()
logger = logging.getLogger("atlas.worker")


async def process_document(ctx: dict, job_id: str) -> str:
    return await run_pipeline(uuid.UUID(job_id))


process_document.__name__ = INGEST_FUNCTION


async def startup(ctx: dict) -> None:
    await ensure_collection()
    recovered = await recover_interrupted_jobs(settings.ingestion_job_timeout_seconds)
    if recovered:
        logger.warning("Marked %s interrupted ingestion job(s) as failed", recovered)
    logger.info("ATLAS worker started")


async def shutdown(ctx: dict) -> None:
    await close_qdrant()
    await close_neo4j()
    await engine.dispose()


class WorkerSettings:
    functions = [process_document]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = redis_settings()
    max_jobs = settings.worker_max_jobs
    job_timeout = settings.ingestion_job_timeout_seconds
    max_tries = 1  # failures are surfaced to users, who retry explicitly
    keep_result = 3600
