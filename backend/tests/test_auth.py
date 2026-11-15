from app.core.config import settings
from tests.conftest import TEST_PASSWORD

API = "/api/v1/auth"


async def test_register_sets_session_and_me_works(client):
    response = await client.post(
        f"{API}/register",
        json={"email": "Ada@Example.com", "full_name": "  Ada   Lovelace ", "password": TEST_PASSWORD},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "ada@example.com"
    assert body["user"]["full_name"] == "Ada Lovelace"
    assert body["memberships"] == []
    assert settings.session_cookie_name in response.cookies

    # The httpOnly cookie alone authenticates subsequent requests.
    me = await client.get(f"{API}/me")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "ada@example.com"


async def test_duplicate_email_is_case_insensitive(client, make_user):
    await make_user(email="dup@example.com")
    response = await client.post(
        f"{API}/register",
        json={"email": "DUP@example.com", "full_name": "Other", "password": TEST_PASSWORD},
    )
    assert response.status_code == 409


async def test_weak_passwords_are_rejected(client):
    for weak in ["short1A", "alllowercase123", "ALLUPPERCASE123", "NoNumbersHere"]:
        response = await client.post(
            f"{API}/register",
            json={"email": "weak@example.com", "full_name": "Weak", "password": weak},
        )
        assert response.status_code == 422, weak


async def test_login_success_and_failure(client, make_user):
    user = await make_user(email="login@example.com")
    bad = await client.post(f"{API}/login", json={"email": user.email, "password": "WrongPass123"})
    assert bad.status_code == 401
    unknown = await client.post(
        f"{API}/login", json={"email": "nobody@example.com", "password": TEST_PASSWORD}
    )
    assert unknown.status_code == 401
    assert bad.json()["detail"] == unknown.json()["detail"]  # no account enumeration

    good = await client.post(
        f"{API}/login", json={"email": "LOGIN@example.com", "password": TEST_PASSWORD}
    )
    assert good.status_code == 200
    assert good.json()["user"]["last_login_at"] is not None


async def test_unauthenticated_and_tampered_tokens_rejected(client, make_user):
    assert (await client.get(f"{API}/me")).status_code == 401
    user = await make_user()
    tampered = user.token[:-2] + ("AA" if not user.token.endswith("AA") else "BB")
    response = await client.get(f"{API}/me", headers={"Authorization": f"Bearer {tampered}"})
    assert response.status_code == 401


async def test_logout_revokes_token(make_user):
    user = await make_user()
    assert (await user.get(f"{API}/me")).status_code == 200
    assert (await user.post(f"{API}/logout")).status_code == 204
    assert (await user.get(f"{API}/me")).status_code == 401


async def test_change_password_invalidates_existing_sessions(client, make_user):
    user = await make_user()
    second = await client.post(f"{API}/login", json={"email": user.email, "password": TEST_PASSWORD})
    second_token = second.json()["access_token"]

    wrong = await user.post(
        f"{API}/change-password",
        json={"current_password": "nope", "new_password": "BrandNewPass99"},
    )
    assert wrong.status_code == 400

    changed = await user.post(
        f"{API}/change-password",
        json={"current_password": TEST_PASSWORD, "new_password": "BrandNewPass99"},
    )
    assert changed.status_code == 200
    new_token = changed.json()["access_token"]

    # Both pre-existing sessions are now invalid; the fresh one works.
    assert (await user.get(f"{API}/me")).status_code == 401
    assert (
        await client.get(f"{API}/me", headers={"Authorization": f"Bearer {second_token}"})
    ).status_code == 401
    assert (
        await client.get(f"{API}/me", headers={"Authorization": f"Bearer {new_token}"})
    ).status_code == 200


async def test_update_profile(make_user):
    user = await make_user(name="Old Name")
    response = await user.patch(f"{API}/me", json={"full_name": "New Name"})
    assert response.status_code == 200
    assert response.json()["full_name"] == "New Name"


async def test_login_rate_limited(client, make_user):
    user = await make_user()
    for _ in range(settings.login_rate_limit):
        await client.post(f"{API}/login", json={"email": user.email, "password": "WrongPass123"})
    blocked = await client.post(f"{API}/login", json={"email": user.email, "password": TEST_PASSWORD})
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
