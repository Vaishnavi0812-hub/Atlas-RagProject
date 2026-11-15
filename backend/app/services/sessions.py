"""Session revocation.

Access tokens are stateless JWTs. Logging out records the token's `jti` in
Redis until the token would have expired, so a stolen or logged-out token is
rejected. Changing a password bumps `User.token_version`, which invalidates
every session the user has at once.
"""

from datetime import UTC, datetime

from app.core.security import AccessToken
from app.db.redis import get_redis


def _key(jti: str) -> str:
    return f"atlas:revoked:{jti}"


async def revoke_token(token: AccessToken) -> None:
    ttl = int((token.expires_at - datetime.now(UTC)).total_seconds())
    if ttl > 0:
        await get_redis().set(_key(token.jti), "1", ex=ttl)


async def is_token_revoked(jti: str) -> bool:
    return bool(await get_redis().exists(_key(jti)))
