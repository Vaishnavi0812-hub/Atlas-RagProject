import pytest

from app.ingestion.chunking import chunk_pages, split_text
from app.ingestion.cleaning import clean_text
from app.ingestion.extraction import Page

PARAGRAPH = (
    "Vendor Alpha supplies the hydraulic actuator used in Product X. "
    "Deliveries are scheduled quarterly under the master supply agreement. "
    "Any delay longer than thirty days must be escalated to procurement."
)


def _doc(paragraphs: int) -> str:
    return "\n\n".join(f"Section {i}. {PARAGRAPH}" for i in range(paragraphs))


def test_chunks_are_exact_slices_within_size():
    text = _doc(20)
    spans = split_text(text, chunk_size=500, chunk_overlap=100)
    assert len(spans) > 1
    for start, end in spans:
        assert 0 <= start < end <= len(text)
        assert end - start <= 500
        assert text[start:end] == text[start:end].strip()


def test_chunks_cover_whole_text_in_order():
    text = _doc(15)
    spans = split_text(text, chunk_size=400, chunk_overlap=80)
    assert spans[0][0] == 0
    assert spans[-1][1] == len(text)
    for (s1, e1), (s2, e2) in zip(spans, spans[1:]):
        assert s2 > s1 and e2 > e1
        # No gaps between consecutive chunks (whitespace aside).
        assert text[e1:s2].strip() == "" or s2 <= e1


def test_overlap_carries_context_between_chunks():
    text = _doc(12)
    spans = split_text(text, chunk_size=450, chunk_overlap=150)
    overlaps = [max(0, e1 - s2) for (s1, e1), (s2, e2) in zip(spans, spans[1:])]
    assert any(o > 0 for o in overlaps)
    assert all(o <= 150 for o in overlaps)


def test_zero_overlap_produces_disjoint_chunks():
    spans = split_text(_doc(10), chunk_size=400, chunk_overlap=0)
    for (_, e1), (s2, _) in zip(spans, spans[1:]):
        assert s2 >= e1


def test_prefers_paragraph_boundaries():
    text = _doc(6)
    spans = split_text(text, chunk_size=len(PARAGRAPH) + 40, chunk_overlap=0)
    # Each paragraph fits in one chunk, so every chunk should be a whole paragraph.
    for start, end in spans:
        assert text[start:end].startswith("Section")


def test_long_unbroken_token_is_hard_split():
    text = "x" * 2500
    spans = split_text(text, chunk_size=1000, chunk_overlap=0)
    assert [e - s for s, e in spans] == [1000, 1000, 500]


def test_invalid_overlap_rejected():
    with pytest.raises(ValueError):
        split_text("abc", chunk_size=100, chunk_overlap=100)


def test_page_numbers_follow_chunk_position():
    pages = [Page(1, _doc(3)), Page(2, _doc(3)), Page(3, _doc(3))]
    text, chunks = chunk_pages(pages, chunk_size=300, chunk_overlap=0)
    assert {c.page_start for c in chunks} == {1, 2, 3}
    page_two_start = text.index(pages[1].text)
    for chunk in chunks:
        assert text[chunk.start : chunk.end] == chunk.text
        expected = 1 if chunk.start < page_two_start else chunk.page_start
        assert chunk.page_start == expected
        assert chunk.page_end >= chunk.page_start
    assert [c.index for c in chunks] == list(range(len(chunks)))


def test_unpaginated_documents_have_no_page_numbers():
    _, chunks = chunk_pages([Page(None, _doc(5))], chunk_size=400, chunk_overlap=50)
    assert all(c.page_start is None for c in chunks)


def test_cleaning_normalises_text_artefacts():
    raw = "Supply  agree-\nment\x00 terms\r\n\n\n\nﬁnal"
    cleaned = clean_text(raw)
    assert cleaned == "Supply agreement terms\n\nfinal"  # dehyphenated, NFKC ligature, no NULs


def test_pdf_reflow_joins_wrapped_lines_only():
    wrapped = (
        "Vendor Alpha shall manufacture and supply the HX-200 hydraulic actuator, a\n"
        "critical component of Northwind's Product X automated rail-switching unit and\n"
        "its replacement parts.\n"
    )
    fields = "Contract number: 123\nExpiry date: 31 December 2026\n"
    items = "• Item one with some words\n• Item two\n"
    raw = "1. Scope of supply\n" + wrapped + fields + items + wrapped
    cleaned = clean_text(raw, reflow=True)
    # Visual wraps inside a paragraph are joined into one line...
    assert "supply the HX-200 hydraulic actuator, a critical component of Northwind's" in cleaned
    assert "unit and its replacement parts." in cleaned
    # ...but deliberate short lines keep their breaks.
    assert "1. Scope of supply\nVendor Alpha" in cleaned
    assert "Contract number: 123\nExpiry date: 31 December 2026" in cleaned
    assert "• Item one with some words\n• Item two" in cleaned
