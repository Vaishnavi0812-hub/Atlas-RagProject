"""Recursive, offset-preserving text chunking.

The text is split on the most meaningful boundary available (paragraph, then
line, sentence, clause, word), recursing only into pieces that are still too
large. Pieces are then packed greedily into chunks of at most `chunk_size`
characters with `chunk_overlap` characters carried between neighbours.

Every chunk is an exact slice `text[start:end]` of the cleaned document, so it
can be traced back to its page and highlighted in the source.
"""

import math
from dataclasses import dataclass

from app.ingestion.extraction import Page

SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "]
PAGE_JOINER = "\n\n"


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str
    start: int
    end: int
    page_start: int | None
    page_end: int | None

    @property
    def token_estimate(self) -> int:
        # ~4 characters per token for English prose; good enough for budgeting.
        return max(1, math.ceil(len(self.text) / 4))


@dataclass(frozen=True)
class _Span:
    start: int
    end: int

    @property
    def length(self) -> int:
        return self.end - self.start


def _split_on(text: str, span: _Span, separator: str) -> list[_Span]:
    """Split a span on `separator`, keeping the separator with the left piece."""
    pieces: list[_Span] = []
    cursor = span.start
    while True:
        found = text.find(separator, cursor, span.end)
        if found == -1:
            break
        cut = found + len(separator)
        pieces.append(_Span(cursor, cut))
        cursor = cut
    if cursor < span.end:
        pieces.append(_Span(cursor, span.end))
    return pieces


def _atomic_pieces(text: str, span: _Span, size: int, separators: list[str]) -> list[_Span]:
    """Break a span into pieces no longer than `size`."""
    if span.length <= size:
        return [span]
    for i, separator in enumerate(separators):
        if text.find(separator, span.start, span.end) == -1:
            continue
        result: list[_Span] = []
        for piece in _split_on(text, span, separator):
            result.extend(_atomic_pieces(text, piece, size, separators[i + 1 :]))
        return result
    # No separator left (e.g. a very long token): hard-cut.
    return [_Span(s, min(s + size, span.end)) for s in range(span.start, span.end, size)]


def _trim(text: str, start: int, end: int) -> tuple[int, int]:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    return start, end


OVERLAP_BOUNDARIES = [". ", "? ", "! ", "\n", "; ", ", ", " "]


def _overlap_start(text: str, lower: int, prev_end: int) -> int | None:
    """Earliest clean boundary (sentence first, then word) in [lower, prev_end)."""
    for boundary in OVERLAP_BOUNDARIES:
        found = text.find(boundary, lower, prev_end)
        if found != -1 and found + len(boundary) < prev_end:
            return found + len(boundary)
    return None


def split_text(text: str, chunk_size: int, chunk_overlap: int) -> list[tuple[int, int]]:
    """Return (start, end) offsets of chunks covering `text`."""
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")
    pieces = _atomic_pieces(text, _Span(0, len(text)), chunk_size, SEPARATORS)

    chunks: list[tuple[int, int]] = []
    window: list[_Span] = []
    for piece in pieces:
        window_len = window[-1].end - window[0].start if window else 0
        if window and window_len + piece.length > chunk_size:
            prev_start, prev_end = window[0].start, window[-1].end
            chunks.append((prev_start, prev_end))
            # Keep trailing whole pieces as overlap, but never so many that the
            # next piece wouldn't fit.
            while window and (
                window[-1].end - window[0].start > chunk_overlap
                or window[-1].end - window[0].start + piece.length > chunk_size
            ):
                window.pop(0)
            # Pieces (e.g. whole paragraphs) can be larger than the overlap
            # budget, leaving nothing to carry over. Fall back to the tail of
            # the previous chunk, starting at a sentence or word boundary.
            if chunk_overlap and not window:
                lower = max(prev_end - chunk_overlap, piece.end - chunk_size, prev_start + 1)
                start = _overlap_start(text, lower, prev_end)
                if start is not None:
                    window = [_Span(start, prev_end)]
        window.append(piece)
    if window:
        chunks.append((window[0].start, window[-1].end))

    trimmed = []
    for start, end in chunks:
        start, end = _trim(text, start, end)
        if end > start and (not trimmed or (start, end) != trimmed[-1]):
            trimmed.append((start, end))
    return trimmed


def chunk_pages(pages: list[Page], chunk_size: int, chunk_overlap: int) -> tuple[str, list[Chunk]]:
    """Join pages into one text (tracking page boundaries) and chunk it.

    Returns the joined text, which is what chunk offsets refer to.
    """
    parts: list[str] = []
    boundaries: list[tuple[int, int, int | None]] = []  # (start, end, page_number)
    cursor = 0
    for page in pages:
        if not page.text:
            continue
        if parts:
            parts.append(PAGE_JOINER)
            cursor += len(PAGE_JOINER)
        parts.append(page.text)
        boundaries.append((cursor, cursor + len(page.text), page.number))
        cursor += len(page.text)
    text = "".join(parts)

    def page_at(offset: int) -> int | None:
        for start, end, number in boundaries:
            if offset < end or (start <= offset <= end):
                return number
        return boundaries[-1][2] if boundaries else None

    chunks = [
        Chunk(
            index=i,
            text=text[start:end],
            start=start,
            end=end,
            page_start=page_at(start),
            page_end=page_at(end - 1),
        )
        for i, (start, end) in enumerate(split_text(text, chunk_size, chunk_overlap))
    ]
    return text, chunks
