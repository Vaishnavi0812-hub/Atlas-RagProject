"""Integration tests for health endpoints. Run inside the backend container,
where all datastores are reachable:

    docker compose exec backend pytest
"""

from httpx import ASGITransport, AsyncClient

from app.main import app


async def test_liveness():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_dependencies_all_reachable():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/health/dependencies")
    assert response.status_code == 200
    body = response.json()
    statuses = {dep["name"]: dep["status"] for dep in body["dependencies"]}
    assert statuses == {"postgres": "ok", "neo4j": "ok", "qdrant": "ok", "redis": "ok"}
    assert body["status"] == "ok"
