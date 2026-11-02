"""Writes sample.xlsx: a tiny two-sheet workbook for the xlsx adapter tests.

Standard library only (an .xlsx is a zip of XML). Run: python3 make-sample-xlsx.py
Sheet "LA": Louisiana's header (code last), numeric designations, a shared string, a blank row.
Sheet "MT": Montana's header.
"""
import zipfile
from xml.sax.saxutils import escape

SHARED = ["Mental Health"]  # one shared string, to cover the sharedStrings path


def cell(ref, value):
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"><v>{value}</v></c>'
    if value in SHARED:
        return f'<c r="{ref}" t="s"><v>{SHARED.index(value)}</v></c>'
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'


def sheet(rows):
    out = []
    for r, row in enumerate(rows, start=1):
        cells = "".join(cell(f"{chr(65 + c)}{r}", v) for c, v in enumerate(row) if v != "")
        out.append(f'<row r="{r}">{cells}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(out)}</sheetData></worksheet>'
    )


LA = [
    ["Category", "Sub-Category", "Group", "Code Designation", "Description", "Code"],
    ["Mental Health", "SMI", "G1", 0, "Schizophrenia", "F20.0"],
    ["", "", "", "", "", ""],
    ["Mental Health", "SMI", "G1", 2, "Depression, unspecified", "F32.9"],
]
MT = [
    ["Category (tier)", "Category", "Condition Name", "Code", "Code Name"],
    ["Tier 1", "Physical", "MS", "G35", "Multiple sclerosis"],
]

files = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
    "</Types>",
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    "</Relationships>",
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    '<sheets><sheet name="LA" sheetId="1" r:id="rId1"/><sheet name="MT" sheetId="2" r:id="rId2"/></sheets>'
    "</workbook>",
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
    "</Relationships>",
    "xl/sharedStrings.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">'
    f'{"".join(f"<si><t>{escape(s)}</t></si>" for s in SHARED)}</sst>',
    "xl/worksheets/sheet1.xml": sheet(LA),
    "xl/worksheets/sheet2.xml": sheet(MT),
}

with zipfile.ZipFile("sample.xlsx", "w", zipfile.ZIP_DEFLATED) as z:
    for name, text in files.items():
        z.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), text)
