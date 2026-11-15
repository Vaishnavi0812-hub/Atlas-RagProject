"""Test configuration.

Tests run inside the backend container against the real datastores, using a
separate `atlas_test` PostgreSQL database and Redis DB 15 so development data
is never touched. Environment overrides must happen before `app` is imported.
"""

import os
import re

os.environ["ENVIRONMENT"] = "test"
os.environ["BCRYPT_ROUNDS"] = "4"
# Offline deterministic embeddings, and file/vector stores separate from dev data.
os.environ["EMBEDDING_PROVIDER"] = "hash"
os.environ["STORAGE_DIR"] = "/tmp/atlas-test-storage"
os.environ["QDRANT_COLLECTION"] = "atlas_chunks_test"
_db_url = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://atlas:atlas_dev_password@localhost:5442/atlas"
)
os.environ["DATABASE_URL"] = _db_url.rsplit("/", 1)[0] + "/atlas_test"
os.environ["REDIS_URL"] = re.sub(
    r"/\d+$", "/15", os.environ.get("REDIS_URL", "redis://localhost:6380/0")
)

import asyncio  # noqa: E402
import uuid  # noqa: E402

import asyncpg  # noqa: E402
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.db import neo4j as neo4j_module  # noqa: E402
from app.db import qdrant as qdrant_module  # noqa: E402
from app.db import redis as redis_module  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

TEST_PASSWORD = "Sup3rSecurePass"


async def _prepare_database() -> None:
    plain = _db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(plain)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = 'atlas_test'")
        if not exists:
            await conn.execute("CREATE DATABASE atlas_test")
    finally:
        await conn.close()

    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    await engine.dispose()
    # Start every run with an empty test collection.
    client = qdrant_module.get_qdrant()
    if await client.collection_exists(os.environ["QDRANT_COLLECTION"]):
        await client.delete_collection(os.environ["QDRANT_COLLECTION"])
    await qdrant_module.ensure_collection()
    await qdrant_module.close_qdrant()


@pytest.fixture(scope="session", autouse=True)
def database():
    asyncio.run(_prepare_database())


@pytest.fixture(autouse=True)
async def clean_state():
    """Fresh tables and Redis per test; reset clients bound to the old loop."""
    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.begin() as connection:
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    await engine.dispose()
    await redis_module.get_redis().flushdb()
    yield
    await redis_module.close_redis()
    await qdrant_module.close_qdrant()
    await neo4j_module.close_neo4j()


class RecordingQueue:
    """Collects enqueued ingestion jobs so tests decide when the worker runs."""

    def __init__(self):
        self.job_ids: list[uuid.UUID] = []

    async def enqueue_ingestion(self, job_id: uuid.UUID) -> None:
        self.job_ids.append(job_id)

    async def drain(self) -> list[str]:
        from app.ingestion.pipeline import process_document

        results = []
        while self.job_ids:
            results.append(await process_document(self.job_ids.pop(0)))
        return results


@pytest.fixture
def job_queue():
    from app.ingestion.queue import get_job_queue

    queue = RecordingQueue()
    app.dependency_overrides[get_job_queue] = lambda: queue
    yield queue
    app.dependency_overrides.pop(get_job_queue, None)


@pytest.fixture
async def client(job_queue):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


class UserSession:
    def __init__(self, client: AsyncClient, email: str, token: str, user_id: str):
        self.client = client
        self.email = email
        self.token = token
        self.id = user_id

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    async def get(self, url, **kw):
        return await self.client.get(url, headers=self.headers, **kw)

    async def post(self, url, **kw):
        return await self.client.post(url, headers=self.headers, **kw)

    async def patch(self, url, **kw):
        return await self.client.patch(url, headers=self.headers, **kw)

    async def put(self, url, **kw):
        return await self.client.put(url, headers=self.headers, **kw)

    async def delete(self, url, **kw):
        return await self.client.delete(url, headers=self.headers, **kw)


@pytest.fixture
def make_user(client):
    async def _make(name: str = "Test User", email: str | None = None) -> UserSession:
        email = email or f"{uuid.uuid4().hex[:10]}@example.com"
        response = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "full_name": name, "password": TEST_PASSWORD},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        # Each session authenticates by header; drop the shared cookie jar so
        # sessions never bleed into one another.
        client.cookies.clear()
        return UserSession(client, email.lower(), body["access_token"], body["user"]["id"])

    return _make


@pytest.fixture
def make_org(make_user):
    """Create an organization owned by `owner` and return (org, default_workspace)."""

    async def _make(owner: UserSession, name: str = "Acme Industries"):
        response = await owner.post("/api/v1/organizations", json={"name": name})
        assert response.status_code == 201, response.text
        org = response.json()
        workspaces = (await owner.get(f"/api/v1/organizations/{org['id']}/workspaces")).json()
        return org, workspaces[0]

    return _make


@pytest.fixture
def add_member():
    """Invite `user` into `org` with `role` and accept on their behalf."""

    async def _add(owner: UserSession, org_id: str, user: UserSession, role: str):
        invite = await owner.post(
            f"/api/v1/organizations/{org_id}/invitations", json={"email": user.email, "role": role}
        )
        assert invite.status_code == 201, invite.text
        accepted = await user.post(f"/api/v1/invitations/{invite.json()['token']}/accept")
        assert accepted.status_code == 200, accepted.text

    return _add
