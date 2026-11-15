API = "/api/v1/organizations"


async def test_create_organization_makes_owner_and_default_workspace(make_user, make_org):
    owner = await make_user("Olivia Owner")
    org, workspace = await make_org(owner, "Northwind Logistics")
    assert org["role"] == "owner"
    assert org["slug"] == "northwind-logistics"
    assert org["member_count"] == 1
    assert workspace["name"] == "General"
    assert workspace["permissions"] == {"can_view": True, "can_edit": True, "can_manage": True}

    me = (await owner.get("/api/v1/auth/me")).json()
    assert me["memberships"][0]["role"] == "owner"


async def test_slugs_are_unique(make_user, make_org):
    a, b = await make_user(), await make_user()
    org_a, _ = await make_org(a, "Same Name")
    org_b, _ = await make_org(b, "Same Name")
    assert org_a["slug"] != org_b["slug"]


async def test_organizations_are_isolated(make_user, make_org):
    alice, mallory = await make_user("Alice"), await make_user("Mallory")
    org, workspace = await make_org(alice)
    await make_org(mallory, "Mallory Corp")

    # Mallory sees only her own organization and gets 404 (not 403) for Alice's.
    listed = (await mallory.get(API)).json()
    assert [o["name"] for o in listed] == ["Mallory Corp"]
    for url in [
        f"{API}/{org['id']}",
        f"{API}/{org['id']}/members",
        f"{API}/{org['id']}/workspaces",
        f"{API}/{org['id']}/workspaces/{workspace['id']}",
        f"{API}/{org['id']}/activity",
    ]:
        assert (await mallory.get(url)).status_code == 404, url
    assert (await mallory.patch(f"{API}/{org['id']}", json={"name": "Hacked"})).status_code == 404
    assert (await mallory.delete(f"{API}/{org['id']}")).status_code == 404


async def test_workspace_from_another_org_is_not_reachable_via_own_org(make_user, make_org):
    alice, mallory = await make_user(), await make_user()
    _, alice_ws = await make_org(alice)
    mallory_org, _ = await make_org(mallory)
    # Mallory pairs her own org id with Alice's workspace id.
    response = await mallory.get(f"{API}/{mallory_org['id']}/workspaces/{alice_ws['id']}")
    assert response.status_code == 404


async def test_role_enforcement(make_user, make_org, add_member):
    owner = await make_user("Owner")
    admin = await make_user("Admin")
    editor = await make_user("Editor")
    viewer = await make_user("Viewer")
    org, _ = await make_org(owner)
    oid = org["id"]
    await add_member(owner, oid, admin, "admin")
    await add_member(owner, oid, editor, "editor")
    await add_member(owner, oid, viewer, "viewer")

    # Only admins+ create workspaces or rename the organization.
    for user, expected in [(viewer, 403), (editor, 403), (admin, 201)]:
        r = await user.post(f"{API}/{oid}/workspaces", json={"name": f"WS {user.id[:4]}"})
        assert r.status_code == expected
    assert (await editor.patch(f"{API}/{oid}", json={"name": "Renamed"})).status_code == 403
    assert (await admin.patch(f"{API}/{oid}", json={"name": "Renamed"})).status_code == 200

    # Only owners delete the organization.
    assert (await admin.delete(f"{API}/{oid}")).status_code == 403

    # Admins cannot grant owner or manage owners.
    assert (
        await admin.patch(f"{API}/{oid}/members/{editor.id}", json={"role": "owner"})
    ).status_code == 403
    assert (
        await admin.patch(f"{API}/{oid}/members/{owner.id}", json={"role": "viewer"})
    ).status_code == 403
    assert (await admin.delete(f"{API}/{oid}/members/{owner.id}")).status_code == 403
    # Admins can manage members below them.
    assert (
        await admin.patch(f"{API}/{oid}/members/{viewer.id}", json={"role": "editor"})
    ).status_code == 200
    # Editors cannot manage members at all.
    assert (await editor.delete(f"{API}/{oid}/members/{viewer.id}")).status_code == 403
    assert (
        await editor.post(f"{API}/{oid}/invitations", json={"email": "x@example.com"})
    ).status_code == 403


async def test_last_owner_protection(make_user, make_org, add_member):
    owner, other = await make_user(), await make_user()
    org, _ = await make_org(owner)
    oid = org["id"]
    assert (await owner.delete(f"{API}/{oid}/members/{owner.id}")).status_code == 409
    assert (
        await owner.patch(f"{API}/{oid}/members/{owner.id}", json={"role": "admin"})
    ).status_code == 409

    # After promoting someone else, the original owner may step down.
    await add_member(owner, oid, other, "viewer")
    assert (
        await owner.patch(f"{API}/{oid}/members/{other.id}", json={"role": "owner"})
    ).status_code == 200
    assert (await owner.delete(f"{API}/{oid}/members/{owner.id}")).status_code == 204
    assert (await owner.get(f"{API}/{oid}")).status_code == 404


async def test_invitation_flow(client, make_user, make_org):
    owner, invitee, stranger = await make_user("Owner"), await make_user("Invitee"), await make_user()
    org, _ = await make_org(owner, "Contoso")
    oid = org["id"]

    created = await owner.post(
        f"{API}/{oid}/invitations", json={"email": invitee.email.upper(), "role": "editor"}
    )
    assert created.status_code == 201
    token = created.json()["token"]
    assert created.json()["invite_url"].endswith(f"/invite/{token}")

    # Public preview shows what is being joined.
    preview = await client.get(f"/api/v1/invitations/{token}")
    assert preview.status_code == 200
    assert preview.json()["organization_name"] == "Contoso"
    assert preview.json()["status"] == "pending"

    # A forwarded link cannot be redeemed by a different account.
    assert (await stranger.post(f"/api/v1/invitations/{token}/accept")).status_code == 403

    accepted = await invitee.post(f"/api/v1/invitations/{token}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "editor"
    # Single use.
    assert (await invitee.post(f"/api/v1/invitations/{token}/accept")).status_code == 410

    members = (await owner.get(f"{API}/{oid}/members")).json()
    assert {m["email"]: m["role"] for m in members}[invitee.email] == "editor"

    # Inviting an existing member is rejected.
    again = await owner.post(f"{API}/{oid}/invitations", json={"email": invitee.email})
    assert again.status_code == 409


async def test_revoked_and_superseded_invitations(make_user, make_org):
    owner, invitee = await make_user(), await make_user()
    org, _ = await make_org(owner)
    oid = org["id"]
    first = (await owner.post(f"{API}/{oid}/invitations", json={"email": invitee.email})).json()
    second = (await owner.post(f"{API}/{oid}/invitations", json={"email": invitee.email})).json()
    # The earlier link was superseded by the new one.
    assert (await invitee.post(f"/api/v1/invitations/{first['token']}/accept")).status_code == 410

    assert (await owner.delete(f"{API}/{oid}/invitations/{second['id']}")).status_code == 204
    assert (await invitee.post(f"/api/v1/invitations/{second['token']}/accept")).status_code == 410


async def test_regenerate_invitation_replaces_link(make_user, make_org):
    owner, invitee = await make_user(), await make_user()
    org, _ = await make_org(owner)
    oid = org["id"]
    inv = (await owner.post(f"{API}/{oid}/invitations", json={"email": invitee.email})).json()
    fresh = (await owner.post(f"{API}/{oid}/invitations/{inv['id']}/regenerate")).json()
    assert fresh["token"] != inv["token"]
    assert (await invitee.post(f"/api/v1/invitations/{inv['token']}/accept")).status_code == 404
    assert (await invitee.post(f"/api/v1/invitations/{fresh['token']}/accept")).status_code == 200


async def test_activity_log_records_actions(make_user, make_org, add_member):
    owner, member = await make_user("Owner"), await make_user("Member")
    org, _ = await make_org(owner)
    await add_member(owner, org["id"], member, "viewer")
    events = (await owner.get(f"{API}/{org['id']}/activity")).json()
    actions = [e["action"] for e in events]
    assert "organization.created" in actions
    assert "invitation.created" in actions
    assert "member.joined" in actions
    assert events[0]["created_at"] >= events[-1]["created_at"]
