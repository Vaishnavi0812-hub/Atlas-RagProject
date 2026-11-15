"""ATLAS API entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.neo4j import close_neo4j, init_neo4j_schema
from app.db.qdrant import close_qdrant, ensure_collection
from app.db.redis import close_redis
from app.db.session import engine
from app.ingestion.queue import close_queue

configure_logging()
logger = logging.getLogger("atlas")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Bootstrap stores that need schema. Failures are logged rather than fatal
    # so the API can still start and report a degraded health status.
    for name, init in (("neo4j", init_neo4j_schema), ("qdrant", ensure_collection)):
        try:
            await init()
        except Exception:  # noqa: BLE001
            logger.exception("Failed to initialise %s on startup", name)
    logger.info("%s API started (%s)", settings.app_name, settings.environment)
    yield
    await close_queue()
    await close_neo4j()
    await close_qdrant()
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title="ATLAS API",
    description="Enterprise Knowledge Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)
