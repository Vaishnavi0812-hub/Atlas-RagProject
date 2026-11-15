"""Chunk vectors in Qdrant.

Every point carries organization_id, workspace_id and document_id in its
payload. Writes and deletes always include the tenant ids so a bug elsewhere
can't touch another tenant's vectors.
"""

import uuid
from dataclasses import dataclass

from qdrant_client.http import models as qm

from app.core.config import settings
from app.db.qdrant import get_qdrant

UPSERT_BATCH = 128


@dataclass
class ChunkVector:
    chunk_id: uuid.UUID
    vector: list[float]
    payload: dict


def _tenant_filter(org_id: uuid.UUID, ws_id: uuid.UUID, doc_id: uuid.UUID | None = None) -> qm.Filter:
    must = [
        qm.FieldCondition(key="organization_id", match=qm.MatchValue(value=str(org_id))),
        qm.FieldCondition(key="workspace_id", match=qm.MatchValue(value=str(ws_id))),
    ]
    if doc_id is not None:
        must.append(qm.FieldCondition(key="document_id", match=qm.MatchValue(value=str(doc_id))))
    return qm.Filter(must=must)


async def upsert_chunk_vectors(items: list[ChunkVector]) -> None:
    client = get_qdrant()
    for i in range(0, len(items), UPSERT_BATCH):
        batch = items[i : i + UPSERT_BATCH]
        await client.upsert(
            collection_name=settings.qdrant_collection,
            points=[qm.PointStruct(id=str(it.chunk_id), vector=it.vector, payload=it.payload) for it in batch],
            wait=True,
        )


async def delete_document_vectors(org_id: uuid.UUID, ws_id: uuid.UUID, doc_id: uuid.UUID) -> None:
    await get_qdrant().delete(
        collection_name=settings.qdrant_collection,
        points_selector=qm.FilterSelector(filter=_tenant_filter(org_id, ws_id, doc_id)),
        wait=True,
    )


async def count_document_vectors(org_id: uuid.UUID, ws_id: uuid.UUID, doc_id: uuid.UUID) -> int:
    result = await get_qdrant().count(
        collection_name=settings.qdrant_collection,
        count_filter=_tenant_filter(org_id, ws_id, doc_id),
        exact=True,
    )
    return result.count
