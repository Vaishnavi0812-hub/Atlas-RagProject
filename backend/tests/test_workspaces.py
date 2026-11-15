import uuid

from qdrant_client.http import models as qm

from app.core.config import settings
from app.db.neo4j import get_neo4j_driver
from app.db.qdrant import get_qdrant

API = "/api/v1/organizations"


async def _restricted_setup(make_user, make_org, add_member, member_role="editor"):
    owner, member = await make_user("Owner"), await make_user("Member")
    org, general = await make_org(owner)
    await add_member(owner, org["id"], member, member_role)
    restricted = (
        await owner.post(
            f"{API}/{org['id']}/workspaces",
            json={"name": "Board Finance", "visibility": "restricted", "color": "gold"},
        )
    ).json()
    return owner, member, org, general, restricted


async def test_restricted_workspace_hidden_until_granted(make_user, make_org, add_member):
    owner, member, org, general, restricted = await _restricted_setup(
        make_user, make_org, add_member
    )
    oid, wid = org["id"], restricted["id"]

    listed = [w["id"] for w in (await member.get(f"{API}/{oid}/workspaces")).json()]
    assert general["id"] in listed and wid not in listed
    assert (await member.get(f"{API}/{oid}/workspaces/{wid}")).status_code == 404

    granted = await owner.put(f"{API}/{oid}/workspaces/{wid}/members/{member.id}", json={"role": "viewer"})
    assert granted.status_code == 200
    assert granted.json()["effective_role"] == "viewer"

    ws = (await member.get(f"{API}/{oid}/workspaces/{wid}")).json()
    assert ws["role"] == "viewer"
    assert ws["permissions"]["can_edit"] is False

    assert (await owner.delete(f"{API}/{oid}/workspaces/{wid}/members/{member.id}")).status_code == 204
    assert (await member.get(f"{API}/{oid}/workspaces/{wid}")).status_code == 404


async def test_grant_never_exceeds_org_role(make_user, make_org, add_member):
    owner, member, org, _, restricted = await _restricted_setup(
        make_user, make_org, add_member, member_role="viewer"
    )
    response = await owner.put(
        f"{API}/{org['id']}/workspaces/{restricted['id']}/members/{member.id}",
        json={"role": "editor"},
    )
    assert response.json()["effective_role"] == "viewer"


async def test_admins_see_all_workspaces_and_grants_to_admins_rejected(make_user, make_org, add_member):
    owner, admin, org, _, restricted = await _restricted_setup(
        make_user, make_org, add_member, member_role="admin"
    )
    listed = [w["id"] for w in (await admin.get(f"{API}/{org['id']}/workspaces")).json()]
    assert restricted["id"] in listed
    response = await owner.put(
        f"{API}/{org['id']}/workspaces/{restricted['id']}/members/{admin.id}", json={"role": "viewer"}
    )
    assert response.status_code == 409


async def test_editors_cannot_manage_workspaces(make_user, make_org, add_member):
    owner, editor = await make_user(), await make_user()
    org, general = await make_org(owner)
    await add_member(owner, org["id"], editor, "editor")
    url = f"{API}/{org['id']}/workspaces/{general['id']}"
    assert (await editor.get(url)).json()["permissions"] == {
        "can_view": True,
        "can_edit": True,
        "can_manage": False,
    }
    assert (await editor.patch(url, json={"name": "Renamed"})).status_code == 403
    assert (await editor.delete(url)).status_code == 403


async def test_update_workspace(make_user, make_org):
    owner = await make_user()
    org, general = await make_org(owner)
    url = f"{API}/{org['id']}/workspaces/{general['id']}"
    updated = await owner.patch(url, json={"name": "Vendor Management", "color": "cobalt"})
    assert updated.status_code == 200
    assert updated.json()["slug"] == "vendor-management"
    assert updated.json()["color"] == "cobalt"


async def test_cannot_delete_last_workspace(make_user, make_org):
    owner = await make_user()
    org, general = await make_org(owner)
    response = await owner.delete(f"{API}/{org['id']}/workspaces/{general['id']}")
    assert response.status_code == 409


async def test_restricted_activity_not_visible_without_access(make_user, make_org, add_member):
    owner, member, org, _, restricted = await _restricted_setup(make_user, make_org, add_member)
    events = (await member.get(f"{API}/{org['id']}/activity")).json()
    assert all(e["workspace_id"] != restricted["id"] for e in events)
    owner_events = (await owner.get(f"{API}/{org['id']}/activity")).json()
    assert any(e["workspace_id"] == restricted["id"] for e in owner_events)
    assert (
        await member.get(f"{API}/{org['id']}/activity", params={"workspace_id": restricted["id"]})
    ).status_code == 404


async def test_deleting_workspace_purges_only_its_vectors_and_graph(make_user, make_org):
    owner = await make_user()
    org, keep_ws = await make_org(owner)
    drop_ws = (await owner.post(f"{API}/{org['id']}/workspaces", json={"name": "Scratch"})).json()

    # Seed one vector and one graph node in each workspace.
    qdrant = get_qdrant()
    point_ids = {}
    for ws in (keep_ws, drop_ws):
        pid = str(uuid.uuid4())
        point_ids[ws["id"]] = pid
        await qdrant.upsert(
            collection_name=settings.qdrant_collection,
            points=[
                qm.PointStruct(
                    id=pid,
                    vector=[0.1] * settings.embedding_dimensions,
                    payload={"organization_id": org["id"], "workspace_id": ws["id"]},
                )
            ],
            wait=True,
        )
        async with get_neo4j_driver().session() as session:
            await session.run(
                "CREATE (:Entity {id: $id, organization_id: $org, workspace_id: $ws})",
                id=str(uuid.uuid4()),
                org=org["id"],
                ws=ws["id"],
            )

    response = await owner.delete(f"{API}/{org['id']}/workspaces/{drop_ws['id']}")
    assert response.status_code == 204

    remaining = await qdrant.retrieve(
        settings.qdrant_collection, ids=list(point_ids.values())
    )
    assert [str(p.id) for p in remaining] == [point_ids[keep_ws["id"]]]

    async with get_neo4j_driver().session() as session:
        record = await (
            await session.run(
                "MATCH (n:Entity {organization_id: $org}) RETURN collect(n.workspace_id) AS ws",
                org=org["id"],
            )
        ).single()
    assert record["ws"] == [keep_ws["id"]]

    # Clean up the remaining fixtures by deleting the organization.
    assert (await owner.delete(f"{API}/{org['id']}")).status_code == 204
    assert await qdrant.retrieve(settings.qdrant_collection, ids=[point_ids[keep_ws["id"]]]) == []
