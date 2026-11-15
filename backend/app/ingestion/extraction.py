"""Text and metadata extraction per file type.

Each extractor returns the document as an ordered list of pages. PDFs carry
real page numbers; DOCX/TXT/Markdown have no fixed pagination, so they are a
single unnumbered page and citations point to character offsets instead.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from app.ingestion.validation import FileValidationError, decode_text


@dataclass
class Page:
    number: int | None
    text: str


@dataclass
class ExtractedDocument:
    pages: list[Page]
    metadata: dict[str, Any] = field(default_factory=dict)


class ExtractionError(RuntimeError):
    """User-presentable extraction failure."""


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value else None


def _clean_meta(meta: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in meta.items() if v not in (None, "", [])}


def extract(path: Path, file_type: str) -> ExtractedDocument:
    if file_type == "pdf":
        return _extract_pdf(path)
    if file_type == "docx":
        return _extract_docx(path)
    if file_type in ("txt", "markdown"):
        return _extract_text(path, file_type)
    raise ExtractionError(f"No extractor for file type '{file_type}'.")


def _extract_pdf(path: Path) -> ExtractedDocument:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            # Many "encrypted" PDFs only restrict editing and open with an empty password.
            if not reader.decrypt(""):
                raise ExtractionError("Password-protected PDFs are not supported.")
        pages = [Page(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]
        info = reader.metadata or {}
    except PdfReadError as exc:
        raise ExtractionError(f"The PDF could not be read: {exc}") from exc

    if not any(p.text.strip() for p in pages):
        raise ExtractionError(
            "No extractable text found. The PDF may be scanned images; OCR is not supported."
        )
    metadata = _clean_meta(
        {
            "title": getattr(info, "title", None),
            "author": getattr(info, "author", None),
            "subject": getattr(info, "subject", None),
            "producer": getattr(info, "producer", None),
            "created_at": _iso(getattr(info, "creation_date", None)),
            "modified_at": _iso(getattr(info, "modification_date", None)),
        }
    )
    return ExtractedDocument(pages=pages, metadata=metadata)


def _extract_docx(path: Path) -> ExtractedDocument:
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        document = docx.Document(str(path))
    except Exception as exc:  # python-docx raises a variety of parser errors
        raise ExtractionError("The Word document could not be opened.") from exc

    blocks: list[str] = []
    headings: list[str] = []
    # Walk the body in order so tables stay where they appear in the document.
    for child in document.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            paragraph = Paragraph(child, document)
            text = paragraph.text.strip()
            if not text:
                continue
            style = (paragraph.style.name if paragraph.style is not None else "") or ""
            match = re.match(r"Heading (\d)", style)
            if match or style == "Title":
                level = int(match.group(1)) if match else 1
                blocks.append(f"{'#' * level} {text}")
                headings.append(text)
            else:
                blocks.append(text)
        elif tag == "tbl":
            table = Table(child, document)
            rows = []
            for row in table.rows:
                cells = [" ".join(cell.text.split()) for cell in row.cells]
                # Merged cells repeat; drop consecutive duplicates.
                deduped = [c for i, c in enumerate(cells) if i == 0 or c != cells[i - 1]]
                rows.append(" | ".join(deduped))
            if rows:
                blocks.append("\n".join(rows))

    text = "\n\n".join(blocks)
    if not text.strip():
        raise ExtractionError("The Word document contains no text.")
    props = document.core_properties
    metadata = _clean_meta(
        {
            "title": props.title or (headings[0] if headings else None),
            "author": props.author,
            "subject": props.subject,
            "created_at": _iso(props.created),
            "modified_at": _iso(props.modified),
            "headings": headings[:30],
        }
    )
    return ExtractedDocument(pages=[Page(None, text)], metadata=metadata)


def _extract_text(path: Path, file_type: str) -> ExtractedDocument:
    try:
        text = decode_text(path.read_bytes())
    except FileValidationError as exc:
        raise ExtractionError(str(exc)) from exc
    if not text.strip():
        raise ExtractionError("The file contains no text.")
    metadata: dict[str, Any] = {}
    if file_type == "markdown":
        headings = re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", text, flags=re.MULTILINE)
        metadata = _clean_meta({"title": headings[0] if headings else None, "headings": headings[:30]})
    return ExtractedDocument(pages=[Page(None, text)], metadata=metadata)
