"""Qdrant client lifecycle and collection bootstrap.

A single collection holds every chunk embedding. Tenant isolation is enforced
by mandatory payload filters on `organization_id` and `workspace_id`, which are
indexed here so filtered search stays fast.
"""

import logging

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qm

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: AsyncQdrantClient | None = None

TENANT_PAYLOAD_INDEXES = ("organization_id", "workspace_id", "document_id")


def get_qdrant() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(url=settings.qdrant_url)
    return _client


async def ensure_collection() -> None:
    client = get_qdrant()
    name = settings.qdrant_collection
    if not await client.collection_exists(name):
        await client.create_collection(
            collection_name=name,
            vectors_config=qm.VectorParams(
                size=settings.embedding_dimensions, distance=qm.Distance.COSINE
            ),
        )
        logger.info("Created Qdrant collection %s", name)
    for field in TENANT_PAYLOAD_INDEXES:
        await client.create_payload_index(
            collection_name=name,
            field_name=field,
            field_schema=qm.PayloadSchemaType.KEYWORD,
        )


async def close_qdrant() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
