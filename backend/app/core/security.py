"""Password hashing, JWT issuance and opaque token helpers."""

import base64
import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import settings


def _prehash(password: str) -> bytes:
    # bcrypt only considers the first 72 bytes. Pre-hashing with SHA-256 lets
    # long passphrases count in full while keeping bcrypt's work factor.
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(_prehash(password), salt).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), password_hash.encode("ascii"))
    except ValueError:
        return False


# Used to keep login timing uniform when the email does not exist.
DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"atlas-timing-equaliser", bcrypt.gensalt(rounds=4)).decode()


@dataclass(frozen=True)
class AccessToken:
    user_id: uuid.UUID
    jti: str
    version: int
    expires_at: datetime


def create_access_token(user_id: uuid.UUID, token_version: int) -> tuple[str, AccessToken]:
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)
    jti = secrets.token_hex(16)
    encoded = jwt.encode(
        {
            "sub": str(user_id),
            "jti": jti,
            "ver": token_version,
            "type": "access",
            "iat": now,
            "exp": expires_at,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return encoded, AccessToken(user_id, jti, token_version, expires_at)


def decode_access_token(token: str) -> AccessToken | None:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub", "jti"]},
        )
        if payload.get("type") != "access":
            return None
        return AccessToken(
            user_id=uuid.UUID(payload["sub"]),
            jti=payload["jti"],
            version=int(payload.get("ver", 0)),
            expires_at=datetime.fromtimestamp(payload["exp"], tz=UTC),
        )
    except (jwt.PyJWTError, ValueError, KeyError):
        return None


def generate_opaque_token() -> str:
    """URL-safe random token (e.g. invitations). Only its hash is stored."""
    return secrets.token_urlsafe(32)


def hash_opaque_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
