"""Fixed-window rate limiting backed by Redis."""

from fastapi import HTTPException, status

from app.db.redis import get_redis


async def enforce_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    redis = get_redis()
    redis_key = f"atlas:ratelimit:{key}"
    count = await redis.incr(redis_key)
    if count == 1:
        await redis.expire(redis_key, window_seconds)
    if count > limit:
        ttl = await redis.ttl(redis_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Please wait before trying again.",
            headers={"Retry-After": str(max(ttl, 1))},
        )


async def reset_rate_limit(key: str) -> None:
    await get_redis().delete(f"atlas:ratelimit:{key}")
