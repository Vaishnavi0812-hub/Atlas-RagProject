import re
import secrets
import unicodedata
from collections.abc import Awaitable, Callable


def slugify(value: str, max_length: int = 60) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value[:max_length].strip("-") or "untitled"


async def unique_slug(name: str, exists: Callable[[str], Awaitable[bool]]) -> str:
    base = slugify(name)
    candidate = base
    for _ in range(20):
        if not await exists(candidate):
            return candidate
        candidate = f"{base}-{secrets.token_hex(2)}"
    return f"{base}-{secrets.token_hex(6)}"
