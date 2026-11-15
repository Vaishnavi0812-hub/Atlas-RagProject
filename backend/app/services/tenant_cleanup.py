"""Remove a tenant's data from the vector and graph stores.

PostgreSQL rows cascade through foreign keys, but Qdrant points and Neo4j
nodes live outside it. These are purged *before* the PostgreSQL delete so a
failure leaves everything intact instead of orphaning vectors or graph nodes.
"""

import logging
import uuid

from qdrant_client.http import models as qm

from app.core.config import settings
from app.db.neo4j import get_neo4j_driver
from app.db.qdrant import get_qdrant

logger = logging.getLogger(__name__)

NEO4J_DELETE_BATCH = 1000


class TenantCleanupError(RuntimeError):
    pass


async def purge_tenant_data(
    *, organization_id: uuid.UUID, workspace_id: uuid.UUID | None = None
) -> None:
    conditions = [
        qm.FieldCondition(key="organization_id", match=qm.MatchValue(value=str(organization_id)))
    ]
    if workspace_id is not None:
        conditions.append(
            qm.FieldCondition(key="workspace_id", match=qm.MatchValue(value=str(workspace_id)))
        )

    try:
        await get_qdrant().delete(
            collection_name=settings.qdrant_collection,
            points_selector=qm.FilterSelector(filter=qm.Filter(must=conditions)),
            wait=True,
        )

        where = "n.organization_id = $org"
        params: dict[str, str | int] = {"org": str(organization_id), "batch": NEO4J_DELETE_BATCH}
        if workspace_id is not None:
            where += " AND n.workspace_id = $ws"
            params["ws"] = str(workspace_id)
        query = (
            f"MATCH (n) WHERE {where} WITH n LIMIT $batch "
            "DETACH DELETE n RETURN count(*) AS deleted"
        )
        async with get_neo4j_driver().session() as session:
            while True:
                record = await (await session.run(query, params)).single()
                if not record or record["deleted"] == 0:
                    break
    except Exception as exc:  # noqa: BLE001
        logger.exception("Tenant cleanup failed (org=%s, ws=%s)", organization_id, workspace_id)
        raise TenantCleanupError("Could not remove data from the vector or graph store.") from exc
