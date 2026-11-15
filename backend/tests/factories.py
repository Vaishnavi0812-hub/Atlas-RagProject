"""Build real PDF / DOCX / text files in memory for tests."""

import io

import docx
from fpdf import FPDF


def make_pdf(pages: list[str], title: str | None = None) -> bytes:
    pdf = FPDF()
    if title:
        pdf.set_title(title)
    pdf.set_font("Helvetica", size=11)
    for text in pages:
        pdf.add_page()
        pdf.multi_cell(0, 6, text)
    return bytes(pdf.output())


def make_docx(paragraphs: list[str], heading: str | None = None, table: list[list[str]] | None = None) -> bytes:
    document = docx.Document()
    if heading:
        document.add_heading(heading, level=1)
        document.core_properties.title = heading
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    if table:
        t = document.add_table(rows=len(table), cols=len(table[0]))
        for r, row in enumerate(table):
            for c, value in enumerate(row):
                t.cell(r, c).text = value
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
