import logging
import sys

from app.core.config import settings


def configure_logging() -> None:
    level = logging.INFO if settings.is_production else logging.DEBUG
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        stream=sys.stdout,
    )
    # Keep chatty third-party loggers quiet.
    for noisy in ("neo4j", "httpx", "httpcore", "asyncio", "multipart"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
