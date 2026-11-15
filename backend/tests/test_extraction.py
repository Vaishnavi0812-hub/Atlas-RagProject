from pathlib import Path

import pytest

from app.ingestion.extraction import ExtractionError, extract
from app.ingestion.validation import FileValidationError, sniff_content
from tests.factories import make_docx, make_pdf


def _write(tmp_path: Path, name: str, data: bytes) -> Path:
    path = tmp_path / name
    path.write_bytes(data)
    return path


def test_pdf_pages_and_metadata(tmp_path):
    path = _write(
        tmp_path,
        "a.pdf",
        make_pdf(["Vendor Alpha supplies Product X.", "Product X is used in Project Delta."], title="Supply Overview"),
    )
    result = extract(path, "pdf")
    assert [p.number for p in result.pages] == [1, 2]
    assert "Vendor Alpha" in result.pages[0].text
    assert "Project Delta" in result.pages[1].text
    assert result.metadata["title"] == "Supply Overview"


def test_docx_keeps_headings_and_tables_in_order(tmp_path):
    path = _write(
        tmp_path,
        "b.docx",
        make_docx(
            ["Contract 123 covers Project Delta."],
            heading="Master Services Agreement",
            table=[["Party", "Role"], ["Vendor Alpha", "Supplier"]],
        ),
    )
    result = extract(path, "docx")
    text = result.pages[0].text
    assert result.pages[0].number is None
    assert text.index("# Master Services Agreement") < text.index("Contract 123") < text.index("Vendor Alpha | Supplier")
    assert result.metadata["title"] == "Master Services Agreement"


def test_markdown_title_from_first_heading(tmp_path):
    path = _write(tmp_path, "c.md", b"# Q3 Procurement Report\n\nSpend rose 12%.\n\n## Vendors\n")
    result = extract(path, "markdown")
    assert result.metadata["title"] == "Q3 Procurement Report"
    assert result.metadata["headings"] == ["Q3 Procurement Report", "Vendors"]


def test_legacy_encoded_text_is_decoded(tmp_path):
    path = _write(tmp_path, "d.txt", "Café supplier — €1,200".encode("cp1252"))
    assert "Café supplier — €1,200" in extract(path, "txt").pages[0].text


def test_pdf_without_text_is_rejected(tmp_path):
    path = _write(tmp_path, "blank.pdf", make_pdf([""]))
    with pytest.raises(ExtractionError, match="No extractable text"):
        extract(path, "pdf")


@pytest.mark.parametrize(
    "name,data,file_type",
    [
        ("fake.pdf", b"MZ\x90\x00 this is an executable", "pdf"),
        ("fake.docx", b"%PDF-1.4 not a zip", "docx"),
        ("bin.txt", b"text\x00with\x00nulls", "txt"),
    ],
)
def test_content_must_match_declared_type(tmp_path, name, data, file_type):
    with pytest.raises(FileValidationError):
        sniff_content(_write(tmp_path, name, data), file_type)


def test_zip_that_is_not_docx_rejected(tmp_path):
    import io
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("readme.txt", "hello")
    with pytest.raises(FileValidationError, match="not a Word"):
        sniff_content(_write(tmp_path, "x.docx", buffer.getvalue()), "docx")
