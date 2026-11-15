"""Original-file storage.

Files live under `STORAGE_DIR/<org>/<workspace>/<document>/source<ext>`. The
user-supplied filename is never used as a path component; it is kept only in
the database. Every resolved path is checked to stay inside the storage root.
"""

import shutil
import uuid
from pathlib import Path

from app.core.config import settings


class StorageError(RuntimeError):
    pass


def _root() -> Path:
    root = Path(settings.storage_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe(path: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_relative_to(_root()):
        raise StorageError("Resolved path escapes the storage root.")
    return resolved


def temp_dir() -> Path:
    path = _root() / "_incoming"
    path.mkdir(parents=True, exist_ok=True)
    return path


def document_key(org_id: uuid.UUID, ws_id: uuid.UUID, doc_id: uuid.UUID, ext: str) -> str:
    return f"{org_id}/{ws_id}/{doc_id}/source{ext}"


def path_for(key: str) -> Path:
    return _safe(_root() / key)


def store_from_temp(temp_path: Path, key: str) -> Path:
    destination = path_for(key)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(temp_path), destination)
    return destination


def delete_document_files(key: str) -> None:
    directory = path_for(key).parent
    if directory.exists():
        shutil.rmtree(directory, ignore_errors=True)


def delete_tenant_files(org_id: uuid.UUID, ws_id: uuid.UUID | None = None) -> None:
    target = _root() / str(org_id)
    if ws_id is not None:
        target = target / str(ws_id)
    target = _safe(target)
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
