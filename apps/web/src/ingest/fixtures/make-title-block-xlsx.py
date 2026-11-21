"""Writes title-block.xlsx: a synthetic one-sheet workbook laid out like Connecticut's list.

Standard library only (an .xlsx is a zip of XML). Run: python3 make-title-block-xlsx.py
Column A is empty. Rows 2-5 are merged B:D title lines, rows 7-13 (odd) are prose lines in
column B (one says "codes", so a naive header guess would stop there), and row 15 is the real
header. NDCs are text with leading zeros; one description keeps trailing spaces. The codes are
real code formats, the text is made up: this is not the state's file.
"""
import zipfile
from xml.sax.saxutils import escape

SHEET = "Medical Frailty Condition Codes"


def cell(ref, value):
    space = ' xml:space="preserve"' if value != value.strip() else ""
    return f'<c r="{ref}" t="inlineStr"><is><t{space}>{escape(value)}</t></is></c>'


def sheet(rows, merges):
    out = []
    for r, row in enumerate(rows, start=1):
        cells = "".join(cell(f"{chr(65 + c)}{r}", v) for c, v in enumerate(row) if v != "")
        out.append(f'<row r="{r}">{cells}</row>')
    merged = "".join(f'<mergeCell ref="{m}"/>' for m in merges)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(out)}</sheetData>'
        f'<mergeCells count="{len(merges)}">{merged}</mergeCells></worksheet>'
    )


BLANK = ["", "", "", ""]
ROWS = [
    BLANK,  # row 1
    ["", "Connecticut Department of Social Services", "", ""],
    ["", "HUSKY D Work Requirements Medical Frailty Exclusion Code List", "", ""],
    ["", "Effective January 1, 2027", "", ""],
    ["", "DRAFT Revision Date: November 4, 2026", "", ""],
    BLANK,  # row 6
    ["", "This workbook lists the diagnosis, drug and procedure codes used for the exclusion.", "", ""],
    BLANK,
    ["", "A member with any one of these codes in the look-back period is excluded.", "", ""],
    BLANK,
    ["", "Drug codes are 11-digit NDCs written without hyphens.", "", ""],
    BLANK,
    ["", "Synthetic test file: the descriptions are shortened.", "", ""],
    BLANK,  # row 14
    ["", "Code Type", "Code", "Code Description"],  # row 15
    ["", "ICD-10", "A15.0", "Tuberculosis of lung"],
    ["", "ICD-10", "F20.0", "Paranoid schizophrenia"],
    ["", "NDC", "00054017613", "BUPRENORPHINE HCL   "],
    ["", "NDC", "00093572001", "NALTREXONE HCL"],
    ["", "HCPCS", "G2067", "Medication assisted treatment, methadone; weekly bundle"],
]
MERGES = ["B2:D2", "B3:D3", "B4:D4", "B5:D5"]

files = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    "</Types>",
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    "</Relationships>",
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    f'<sheets><sheet name="{escape(SHEET)}" sheetId="1" r:id="rId1"/></sheets>'
    "</workbook>",
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    "</Relationships>",
    "xl/worksheets/sheet1.xml": sheet(ROWS, MERGES),
}

with zipfile.ZipFile("title-block.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
    for name, text in files.items():
        z.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), text)
