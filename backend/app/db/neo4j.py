"""Neo4j driver lifecycle.

The knowledge graph lives in Neo4j. Every node and relationship written by
ATLAS carries `organization_id` and `workspace_id` properties; the constraints
and indexes created here make those tenant-scoped lookups fast.
"""

import logging

from neo4j import AsyncDriver, AsyncGraphDatabase

from app.core.config import settings

logger = logging.getLogger(__name__)

_driver: AsyncDriver | None = None

SCHEMA_STATEMENTS = [
    "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
    "CREATE INDEX entity_workspace IF NOT EXISTS FOR (e:Entity) ON (e.workspace_id)",
    "CREATE INDEX entity_norm_name IF NOT EXISTS "
    "FOR (e:Entity) ON (e.workspace_id, e.normalized_name)",
    "CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.workspace_id, e.type)",
]


def get_neo4j_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password)
        )
    return _driver


async def init_neo4j_schema() -> None:
    driver = get_neo4j_driver()
    async with driver.session() as session:
        for statement in SCHEMA_STATEMENTS:
            await session.run(statement)
    logger.info("Neo4j schema constraints and indexes ensured")


async def close_neo4j() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
