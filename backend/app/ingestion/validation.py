"""Upload validation: extension allow-list, size limits and content sniffing.

The declared extension must agree with the file's actual bytes, so a renamed
executable or archive can't be ingested as a PDF or text file.
"""

import hashlib
import secrets
import zipfile
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.ingestion.storage import temp_dir

FILE_TYPES: dict[str, tuple[str, str]] = {
    ".pdf": ("pdf", "application/pdf"),
    ".docx": ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".txt": ("txt", "text/plain"),
    ".md": ("markdown", "text/markdown"),
    ".markdown": ("markdown", "text/markdown"),
}

READ_CHUNK = 1024 * 1024
MAX_DOCX_UNCOMPRESSED = 200 * 1024 * 1024  # guards against zip bombs


class FileValidationError(ValueError):
    """User-presentable validation failure."""


@dataclass
class ReceivedFile:
    temp_path: Path
    filename: str
    extension: str
    file_type: str
    content_type: str
    size_bytes: int
    sha256: str


def clean_filename(name: str | None) -> str:
    name = (name or "untitled").replace("\\", "/").split("/")[-1].strip()
    name = "".join(ch for ch in name if ch.isprintable())
    return (name or "untitled")[:255]


def extension_of(filename: str) -> str:
    return Path(filename).suffix.lower()


async def receive_upload(upload: UploadFile) -> ReceivedFile:
    """Stream an upload to a temp file, enforcing the size limit and hashing
    as we go, then verify the content matches the declared type."""
    filename = clean_filename(upload.filename)
    ext = extension_of(filename)
    if ext not in FILE_TYPES:
        raise FileValidationError(
            f"Unsupported file type '{ext or 'none'}'. Upload PDF, DOCX, TXT or Markdown files."
        )
    file_type, content_type = FILE_TYPES[ext]
    limit = settings.max_upload_mb * 1024 * 1024
    temp_path = temp_dir() / f"{secrets.token_hex(16)}{ext}"
    digest = hashlib.sha256()
    size = 0
    try:
        with temp_path.open("wb") as out:
            while chunk := await upload.read(READ_CHUNK):
                size += len(chunk)
                if size > limit:
                    raise FileValidationError(
                        f"File exceeds the {settings.max_upload_mb} MB upload limit."
                    )
                digest.update(chunk)
                out.write(chunk)
        if size == 0:
            raise FileValidationError("File is empty.")
        sniff_content(temp_path, file_type)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    return ReceivedFile(temp_path, filename, ext, file_type, content_type, size, digest.hexdigest())


def sniff_content(path: Path, file_type: str) -> None:
    with path.open("rb") as fh:
        head = fh.read(8192)

    if file_type == "pdf":
        if not head.startswith(b"%PDF-"):
            raise FileValidationError("This file does not look like a valid PDF.")
        return

    if file_type == "docx":
        if not zipfile.is_zipfile(path):
            raise FileValidationError("This file does not look like a valid Word (.docx) document.")
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            if "word/document.xml" not in names or "[Content_Types].xml" not in names:
                raise FileValidationError("This archive is not a Word (.docx) document.")
            if sum(info.file_size for info in archive.infolist()) > MAX_DOCX_UNCOMPRESSED:
                raise FileValidationError("Word document is too large once decompressed.")
        return

    # Plain text / Markdown: no NUL bytes and decodable text.
    if b"\x00" in head:
        raise FileValidationError("This file contains binary data, not text.")
    decode_text(path.read_bytes())


def decode_text(raw: bytes) -> str:
    """UTF-8 (with or without BOM), falling back to Windows-1252 for legacy files."""
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    try:
        return raw.decode("cp1252")
    except UnicodeDecodeError as exc:
        raise FileValidationError("Could not decode this text file. Save it as UTF-8.") from exc
