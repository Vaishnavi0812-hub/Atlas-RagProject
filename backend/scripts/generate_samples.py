"""Generate the binary sample documents (DOCX + PDF) in sample_data/.

    docker compose exec backend python scripts/generate_samples.py /samples
"""

import sys
from pathlib import Path

import docx
from fpdf import FPDF

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "../sample_data")


def project_delta_charter() -> None:
    d = docx.Document()
    d.core_properties.title = "Project Delta Charter"
    d.core_properties.author = "Northwind PMO"
    d.add_heading("Project Delta Charter", level=1)
    d.add_paragraph(
        "Project Delta upgrades the Contoso Rail freight corridor between Rotterdam and Duisburg "
        "with 240 Product X automated rail-switching units. The project is sponsored by the Northwind "
        "Rail Systems Division and managed by the Northwind Programme Management Office."
    )
    d.add_heading("Scope", level=2)
    d.add_paragraph(
        "Northwind will supply, install and commission Product X units at 38 junctions. Installation "
        "runs in four phases between March 2026 and June 2027. Phase 3 (96 units) is scheduled to "
        "begin in January 2027 and requires delivery of the corresponding Product X units by "
        "December 2026."
    )
    d.add_heading("Contractual basis", level=2)
    d.add_paragraph(
        "Project Delta is delivered under Contract 123 between Northwind Logistics Inc. and Contoso "
        "Rail B.V. Contract 123 defines delivery milestones, liquidated damages and renewal terms. "
        "The Contract Management Office is responsible for contract compliance."
    )
    d.add_heading("Key dependencies", level=2)
    t = d.add_table(rows=4, cols=3)
    rows = [
        ("Dependency", "Provider", "Risk"),
        ("Product X units", "Northwind Rail Systems", "Medium"),
        ("HX-200 actuators (inside Product X)", "Vendor Alpha Components Ltd.", "High"),
        ("Track possession windows", "Contoso Rail B.V.", "Low"),
    ]
    for r, row in enumerate(rows):
        for c, value in enumerate(row):
            t.cell(r, c).text = value
    d.add_heading("Budget", level=2)
    d.add_paragraph("The approved project budget is EUR 18.4 million, including a 7% contingency reserve.")
    d.save(OUT / "project-delta-charter.docx")


def contract_123_summary() -> None:
    pages = [
        (
            "CONTRACT 123 - EXECUTIVE SUMMARY\n\n"
            "Contract number: 123\n"
            "Parties: Northwind Logistics Inc. (Supplier) and Contoso Rail B.V. (Customer)\n"
            "Signed: 14 November 2023\n"
            "Expiry date: 31 December 2026\n"
            "Total contract value: EUR 21.5 million\n\n"
            "1. Purpose\n"
            "Contract 123 governs the supply, installation and maintenance of automated rail-switching "
            "units for Project Delta on the Contoso Rail freight corridor.\n\n"
            "2. Products and services\n"
            "Northwind supplies Product X switching units, installation services, and a five-year "
            "maintenance service for installed units."
        ),
        (
            "3. Delivery milestones\n"
            "Milestone M3: delivery of 96 Product X units by 15 December 2026.\n"
            "Liquidated damages of EUR 25,000 per week apply to late delivery of milestone units, "
            "capped at 10% of the contract value.\n\n"
            "4. Renewal\n"
            "The contract expires on 31 December 2026. It renews for a further two years only if either "
            "party gives written notice of renewal at least 90 days before expiry, that is, by "
            "2 October 2026. Contoso Rail has indicated it will decide on renewal after milestone M3.\n\n"
            "5. Payment terms\n"
            "Invoices are payable within 45 days. 10% of each milestone payment is retained until "
            "final acceptance.\n\n"
            "6. Governing law\n"
            "Laws of the Netherlands."
        ),
    ]
    pdf = FPDF()
    pdf.set_title("Contract 123 Executive Summary")
    pdf.set_author("Northwind Contract Management Office")
    pdf.set_font("Helvetica", size=11)
    for text in pages:
        pdf.add_page()
        pdf.multi_cell(0, 6, text)
    pdf.output(str(OUT / "contract-123-summary.pdf"))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    project_delta_charter()
    contract_123_summary()
    print(f"Wrote samples to {OUT.resolve()}")
