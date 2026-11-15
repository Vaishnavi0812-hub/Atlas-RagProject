from pathlib import Path

from qdrant_client.http import models as qm

from app.core.config import settings
from app.db.qdrant import get_qdrant
from app.ingestion import storage
from tests.factories import make_docx, make_pdf

API = "/api/v1/organizations"

CONTRACT = "\n\n".join(
    f"Clause {i}. Vendor Alpha shall supply hydraulic actuators for Product X, which is "
    f"deployed in Project Delta. Contract 123 expires in December 2026 unless renewed."
    for i in range(1, 31)
)


def _docs_url(org, ws):
    return f"{API}/{org['id']}/workspaces/{ws['id']}/documents"


async def _upload(user, org, ws, files):
    return await user.post(_docs_url(org, ws), files=[("files", f) for f in files])


async def _vector_payloads(document_id: str) -> list[dict]:
    points, _ = await get_qdrant().scroll(
        settings.qdrant_collection,
        scroll_filter=qm.Filter(
            must=[qm.FieldCondition(key="document_id", match=qm.MatchValue(value=document_id))]
        ),
        limit=1000,
        with_payload=True,
    )
    return [p.payload for p in points]


async def test_upload_and_process_all_formats(make_user, make_org, job_queue):
    owner = await make_user()
    org, ws = await make_org(owner)
    response = await _upload(
        owner,
        org,
        ws,
        [
            ("contract.pdf", make_pdf([CONTRACT[:1500], CONTRACT[1500:3000]], title="Supply Contract"), "application/pdf"),
            ("agreement.docx", make_docx(["Project Delta depends on Product X."], heading="Delta Charter"), "application/octet-stream"),
            ("notes.txt", b"Vendor Alpha delivery is late.", "text/plain"),
            ("report.md", b"# Q3 Report\n\nSpend on Vendor Alpha rose 12%.", "text/markdown"),
        ],
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["errors"] == []
    assert {d["file_type"] for d in body["documents"]} == {"pdf", "docx", "txt", "markdown"}
    assert all(d["status"] == "queued" for d in body["documents"])

    assert await job_queue.drain() == ["completed"] * 4

    docs = {d["filename"]: d for d in (await owner.get(_docs_url(org, ws))).json()}
    pdf = docs["contract.pdf"]
    assert pdf["status"] == "completed" and pdf["progress"] == 100
    assert pdf["page_count"] == 2
    assert pdf["chunk_count"] > 1
    assert pdf["metadata"]["title"] == "Supply Contract"
    assert pdf["processing_ms"] is not None
    assert docs["agreement.docx"]["metadata"]["title"] == "Delta Charter"
    assert docs["report.md"]["metadata"]["title"] == "Q3 Report"

    # Vectors carry full tenant provenance and match the stored chunks.
    payloads = await _vector_payloads(pdf["id"])
    assert len(payloads) == pdf["chunk_count"]
    assert {p["organization_id"] for p in payloads} == {org["id"]}
    assert {p["workspace_id"] for p in payloads} == {ws["id"]}
    assert {p["page_number"] for p in payloads} == {1, 2}

    chunks = (await owner.get(f"{_docs_url(org, ws)}/{pdf['id']}/chunks")).json()
    assert chunks["total"] == pdf["chunk_count"]
    assert [c["chunk_index"] for c in chunks["items"]] == list(range(chunks["total"]))
    page_two = (await owner.get(f"{_docs_url(org, ws)}/{pdf['id']}/chunks", params={"page": 2})).json()
    assert page_two["total"] >= 1 and all(
        c["page_number"] <= 2 <= (c["page_end"] or c["page_number"]) for c in page_two["items"]
    )

    detail = (await owner.get(f"{_docs_url(org, ws)}/{pdf['id']}")).json()
    stages = [e["stage"] for e in detail["jobs"][0]["events"]]
    assert stages == ["validating", "extracting", "cleaning", "metadata", "chunking", "embedding", "indexing"]
    assert detail["embedding_model"].startswith("hash:")

    stats = (await owner.get(f"{_docs_url(org, ws)}/stats")).json()
    assert stats["total"] == 4 and stats["completed"] == 4 and stats["failed"] == 0
    assert stats["chunks"] == sum(d["chunk_count"] for d in docs.values())


async def test_upload_validation_errors(make_user, make_org, job_queue):
    owner = await make_user()
    org, ws = await make_org(owner)
    response = await _upload(
        owner,
        org,
        ws,
        [
            ("virus.exe", b"MZ", "application/octet-stream"),
            ("fake.pdf", b"not really a pdf", "application/pdf"),
            ("empty.txt", b"", "text/plain"),
            ("ok.txt", b"Valid content.", "text/plain"),
        ],
    )
    assert response.status_code == 201
    body = response.json()
    assert [d["filename"] for d in body["documents"]] == ["ok.txt"]
    errors = {e["filename"]: e["error"] for e in body["errors"]}
    assert "Unsupported file type" in errors["virus.exe"]
    assert "valid PDF" in errors["fake.pdf"]
    assert "empty" in errors["empty.txt"]
    assert len(job_queue.job_ids) == 1


async def test_duplicate_upload_rejected_within_workspace(make_user, make_org, job_queue):
    owner = await make_user()
    org, ws = await make_org(owner)
    first = await _upload(owner, org, ws, [("a.txt", b"Same bytes.", "text/plain")])
    second = await _upload(owner, org, ws, [("b.txt", b"Same bytes.", "text/plain")])
    assert second.json()["documents"] == []
    error = second.json()["errors"][0]
    assert error["existing_document_id"] == first.json()["documents"][0]["id"]

    # ...but the same file is fine in a different workspace.
    other = (await owner.post(f"{API}/{org['id']}/workspaces", json={"name": "Other"})).json()
    third = await _upload(owner, org, other, [("a.txt", b"Same bytes.", "text/plain")])
    assert len(third.json()["documents"]) == 1


async def test_failed_processing_can_be_retried(make_user, make_org, job_queue):
    owner = await make_user()
    org, ws = await make_org(owner)
    upload = await _upload(owner, org, ws, [("blank.pdf", make_pdf([""]), "application/pdf")])
    doc_id = upload.json()["documents"][0]["id"]
    assert await job_queue.drain() == ["failed"]

    doc = (await owner.get(f"{_docs_url(org, ws)}/{doc_id}")).json()
    assert doc["status"] == "failed"
    assert "No extractable text" in doc["error"]
    assert doc["jobs"][0]["events"][-1]["stage"] == "failed"
    assert await _vector_payloads(doc_id) == []

    retry = await owner.post(f"{_docs_url(org, ws)}/{doc_id}/reprocess")
    assert retry.status_code == 200 and retry.json()["status"] == "queued"
    # Can't queue twice.
    assert (await owner.post(f"{_docs_url(org, ws)}/{doc_id}/reprocess")).status_code == 409
    await job_queue.drain()
    jobs = (await owner.get(f"{_docs_url(org, ws)}/{doc_id}")).json()["jobs"]
    assert [j["kind"] for j in jobs] == ["retry", "ingest"]
    assert [j["attempt"] for j in jobs] == [2, 1]


async def test_reprocess_with_new_chunk_settings_replaces_vectors(make_user, make_org, job_queue):
    owner = await make_user()
    org, ws = await make_org(owner)
    doc_id = (await _upload(owner, org, ws, [("c.txt", CONTRACT.encode(), "text/plain")])).json()["documents"][0]["id"]
    await job_queue.drain()
    before = (await owner.get(f"{_docs_url(org, ws)}/{doc_id}")).json()["chunk_count"]

    updated = await owner.patch(
        f"{API}/{org['id']}/workspaces/{ws['id']}",
        json={"settings": {"chunk_size": 400, "chunk_overlap": 50, "viewers_can_download": True}},
    )
    assert updated.status_code == 200
    assert updated.json()["settings"]["chunk_size"] == 400

    await owner.post(f"{_docs_url(org, ws)}/{doc_id}/reprocess")
    await job_queue.drain()
    after = (await owner.get(f"{_docs_url(org, ws)}/{doc_id}")).json()
    assert after["chunk_count"] > before
    assert len(await _vector_payloads(doc_id)) == after["chunk_count"]
    assert after["jobs"][0]["settings_snapshot"] == {"chunk_size": 400, "chunk_overlap": 50}


async def test_invalid_chunk_settings_rejected(make_user, make_org):
    owner = await make_user()
    org, ws = await make_org(owner)
    bad = await owner.patch(
        f"{API}/{org['id']}/workspaces/{ws['id']}",
        json={"settings": {"chunk_size": 500, "chunk_overlap": 400}},
    )
    assert bad.status_code == 422


async def test_delete_removes_vectors_file_and_rows(make_user, make_org, job_queue):
    owner = await make_user()
    org, ws = await make_org(owner)
    docs = (await _upload(owner, org, ws, [("keep.txt", b"Keep this one.", "text/plain"), ("drop.txt", b"Drop this one.", "text/plain")])).json()["documents"]
    await job_queue.drain()
    keep, drop = docs
    detail = (await owner.get(f"{_docs_url(org, ws)}/{drop['id']}")).json()
    assert detail["status"] == "completed"

    # Locate the stored file before deleting.
    from sqlalchemy import select

    from app.db.session import SessionLocal
    from app.models import Document

    async with SessionLocal() as db:
        key = await db.scalar(select(Document.storage_key).where(Document.id == drop["id"]))
    assert storage.path_for(key).exists()

    assert (await owner.delete(f"{_docs_url(org, ws)}/{drop['id']}")).status_code == 204
    assert (await owner.get(f"{_docs_url(org, ws)}/{drop['id']}")).status_code == 404
    assert await _vector_payloads(drop["id"]) == []
    assert not Path(storage.path_for(key)).parent.exists()
    assert len(await _vector_payloads(keep["id"])) == 1


async def test_deleting_during_processing_leaves_no_vectors(make_user, make_org, job_queue):
    owner = await make_user()
    org, ws = await make_org(owner)
    doc_id = (await _upload(owner, org, ws, [("x.txt", CONTRACT.encode(), "text/plain")])).json()["documents"][0]["id"]
    # Delete before the worker picks the job up.
    assert (await owner.delete(f"{_docs_url(org, ws)}/{doc_id}")).status_code == 204
    assert await job_queue.drain() == ["missing"]
    assert await _vector_payloads(doc_id) == []


async def test_document_permissions(make_user, make_org, add_member, job_queue):
    owner, viewer = await make_user(), await make_user()
    org, ws = await make_org(owner)
    await add_member(owner, org["id"], viewer, "viewer")
    doc_id = (await _upload(owner, org, ws, [("p.txt", b"Policy text.", "text/plain")])).json()["documents"][0]["id"]
    await job_queue.drain()
    url = _docs_url(org, ws)

    # Viewers read but don't write.
    assert (await viewer.get(url)).status_code == 200
    assert (await viewer.get(f"{url}/{doc_id}/chunks")).status_code == 200
    assert (await _upload(viewer, org, ws, [("v.txt", b"nope", "text/plain")])).status_code == 403
    assert (await viewer.post(f"{url}/{doc_id}/reprocess")).status_code == 403
    assert (await viewer.delete(f"{url}/{doc_id}")).status_code == 403

    download = await viewer.get(f"{url}/{doc_id}/download")
    assert download.status_code == 200 and download.content == b"Policy text."
    assert "attachment" in download.headers["content-disposition"]

    await owner.patch(
        f"{API}/{org['id']}/workspaces/{ws['id']}",
        json={"settings": {"chunk_size": 1200, "chunk_overlap": 200, "viewers_can_download": False}},
    )
    assert (await viewer.get(f"{url}/{doc_id}/download")).status_code == 403
    assert (await viewer.get(f"{url}/{doc_id}/file")).status_code == 403
    assert (await viewer.get(f"{url}/{doc_id}")).json()["can_download"] is False
    assert (await owner.get(f"{url}/{doc_id}/download")).status_code == 200


async def test_documents_isolated_between_tenants(make_user, make_org, job_queue):
    alice, mallory = await make_user(), await make_user()
    org, ws = await make_org(alice)
    m_org, m_ws = await make_org(mallory)
    doc_id = (await _upload(alice, org, ws, [("secret.txt", b"Acquisition target list.", "text/plain")])).json()["documents"][0]["id"]
    await job_queue.drain()

    assert (await mallory.get(_docs_url(org, ws))).status_code == 404
    # Mallory's own workspace path with Alice's document id.
    for suffix in ["", "/chunks", "/download", "/file"]:
        assert (await mallory.get(f"{_docs_url(m_org, m_ws)}/{doc_id}{suffix}")).status_code == 404
    assert (await mallory.delete(f"{_docs_url(m_org, m_ws)}/{doc_id}")).status_code == 404
    assert (await mallory.get(_docs_url(m_org, m_ws))).json() == []


async def test_text_preview_is_served_as_inert_plain_text(make_user, make_org, job_queue):
    owner = await make_user()
    org, ws = await make_org(owner)
    doc_id = (await _upload(owner, org, ws, [("x.md", b"# Hi\n<script>alert(1)</script>", "text/markdown")])).json()["documents"][0]["id"]
    response = await owner.get(f"{_docs_url(org, ws)}/{doc_id}/file")
    assert response.headers["content-type"].startswith("text/plain")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "default-src 'none'" in response.headers["content-security-policy"]


async def test_deleting_workspace_removes_document_files(make_user, make_org, job_queue):
    owner = await make_user()
    org, _ = await make_org(owner)
    ws = (await owner.post(f"{API}/{org['id']}/workspaces", json={"name": "Temp"})).json()
    doc_id = (await _upload(owner, org, ws, [("t.txt", b"Temporary.", "text/plain")])).json()["documents"][0]["id"]
    await job_queue.drain()
    ws_dir = Path(settings.storage_dir) / org["id"] / ws["id"]
    assert ws_dir.exists()
    assert (await owner.delete(f"{API}/{org['id']}/workspaces/{ws['id']}")).status_code == 204
    assert not ws_dir.exists()
    assert await _vector_payloads(doc_id) == []
