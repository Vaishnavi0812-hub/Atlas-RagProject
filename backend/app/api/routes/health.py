"""Health endpoints.

`/health` is a cheap liveness probe. `/health/dependencies` actively checks
each datastore and reports latency, which the frontend uses for the system
status indicator.
"""

import asyncio
import time
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import settings
from app.db.neo4j import get_neo4j_driver
from app.db.qdrant import get_qdrant
from app.db.redis import get_redis
from app.db.session import engine

router = APIRouter(tags=["health"])

CHECK_TIMEOUT_SECONDS = 3.0


class DependencyStatus(BaseModel):
    name: str
    status: Literal["ok", "error"]
    latency_ms: float | None = None
    detail: str | None = None


class HealthReport(BaseModel):
    status: Literal["ok", "degraded"]
    app: str
    environment: str
    dependencies: list[DependencyStatus]


async def _check_postgres() -> None:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


async def _check_neo4j() -> None:
    await get_neo4j_driver().verify_connectivity()


async def _check_qdrant() -> None:
    await get_qdrant().get_collections()


async def _check_redis() -> None:
    await get_redis().ping()


async def _run_check(name: str, check) -> DependencyStatus:
    started = time.perf_counter()
    try:
        await asyncio.wait_for(check(), timeout=CHECK_TIMEOUT_SECONDS)
    except Exception as exc:  # noqa: BLE001 - report any failure as a status
        return DependencyStatus(name=name, status="error", detail=type(exc).__name__)
    latency = round((time.perf_counter() - started) * 1000, 1)
    return DependencyStatus(name=name, status="ok", latency_ms=latency)


@router.get("/health")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/dependencies", response_model=HealthReport)
async def dependencies() -> HealthReport:
    results = await asyncio.gather(
        _run_check("postgres", _check_postgres),
        _run_check("neo4j", _check_neo4j),
        _run_check("qdrant", _check_qdrant),
        _run_check("redis", _check_redis),
    )
    overall = "ok" if all(r.status == "ok" for r in results) else "degraded"
    return HealthReport(
        status=overall,
        app=settings.app_name,
        environment=settings.environment,
        dependencies=list(results),
    )
