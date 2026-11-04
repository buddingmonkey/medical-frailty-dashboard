# @mfcd/reference-data

Builds the `ref_codes` table (ICD-10-CM and HCPCS Level II, public domain) from CMS's own
files, and the `ref_ccsr` and `ref_ccsr_categories` tables (ICD-10-CM → AHRQ CCSR categories)
from AHRQ's DXCCSR file. Ingestion uses it to check that a state's codes exist, to tell billable codes from
header codes (a state that lists the header `F31.1` probably means everything under it), and
to settle `system_ambiguous` codes. The M5 compare views group ICD-10-CM codes by their CCSR
categories (`docs/data-model.md`, "CCSR reference data"). No CPT: CPT belongs to the AMA (`docs/data-model.md`,
"Licensing of code text").

## Releases in use

| Release | File | Codes | Valid from |
| --- | --- | --- | --- |
| `icd10cm-fy2027` | CMS "2027 Code Descriptions in Tabular Order", `icd10cm_order_2027.txt` | 98,403 (74,879 billable) | 2026-10-01 |
| `hcpcs-2026-10` | CMS "October 2026 Alpha-Numeric HCPCS File" | 8,770 (1,322 terminated) | 2026-10-01 |
| `ccsr-dx-2026.1` | AHRQ HCUP DXCCSR v2026.1, `DXCCSR-v2026-1/DXCCSR_v2026-1.csv` | 75,725 codes, 553 categories | (CCSR release) |

URLs and SHA-256 sums are pinned in `src/sources.ts`. The build refuses a file whose checksum
changed.

## CCSR licence and citation

Clinical Classifications Software Refined (CCSR) for ICD-10-CM Diagnoses, v2026.1. Healthcare
Cost and Utilization Project (HCUP). Agency for Healthcare Research and Quality, Rockville, MD.
https://hcup-us.ahrq.gov/toolssoftware/ccsr/dxccsr.jsp

AHRQ states no licence for these files, and the question is on the legal team's list. Until it
is settled (project lead, 2026-11-02):

- **Never commit the CCSR file** or lines copied from it. The build downloads the zip into
  `.cache/` and writes only to `dist/` (both gitignored).
- Test fixtures are synthetic: `fixtures/dxccsr_synthetic.csv` has AHRQ's column layout with
  invented categories (`TST001`) and groupings.
- Cite AHRQ wherever CCSR categories are shown.

## Commands

The same in PowerShell, cmd and bash:

```text
pnpm db:ref:local                                         # build, then load into local D1 (~20 s)
pnpm --filter @mfcd/reference-data build                  # download (cached in .cache/), parse, write dist/*.sql
pnpm --filter @mfcd/reference-data load --local           # apply the chunks local D1 lacks
pnpm --filter @mfcd/reference-data load --env preview     # remote preview, up to 80,000 rows per run
pnpm --filter @mfcd/reference-data ccsr-coverage          # local D1: do published ICD-10-CM codes find CCSR groups?
```

Production is loaded only from CI: the **Reference data** workflow
(`.github/workflows/reference-data.yml`, run by hand, after approval). Outside GitHub Actions,
`load` refuses `--env production`.

## Free-tier limit (why loads are chunked)

D1's free tier allows **100,000 rows written per day for the whole account** (preview and
production together). The full set is 173,935 rows (107,173 `ref_codes`, 66,762 CCSR), so:

- `ref_codes` is `WITHOUT ROWID` with no secondary index: one write per row.
- `ref_ccsr` is stored by prefix (below): 87,705 code-to-category pairs become 66,209 rows.
- The build writes 37 chunk files of up to 5,000 rows (22 CMS, 15 CCSR: the category names in
  `ccsr-dx-2026.1-000`, then `ref_ccsr`). Each chunk marks itself in `app_meta`
  (`ref_codes_chunk:<name>`), so `load` skips what is already there and stops before its row
  budget (`--max-rows`, default 80,000).
- The first remote load takes **two to three days per database**. Run `load` again after 00:00 UTC.
- On Workers Paid ($5/month) one run loads everything. The account has been on it since
  2026-11-01 (`docs/status.md`, "Workers plan"); the loader works the same either way.

## Updating

CMS publishes ICD-10-CM once a year (files in June, valid from 1 October; sometimes an
April update) and HCPCS every quarter (January, April, July, October). **Do not reload a whole
release:** the primary key includes `valid_from`, so a full new release would add ~107k rows
(another two days of quota per database) and duplicate every unchanged code.

The update path, to build before the first update is needed (watch date: HCPCS January 2027,
`docs/status.md`):

1. Add the new release to `src/sources.ts` (URL, SHA-256, member file, `validFrom`).
2. A diff step compares the new file with the codes already loaded and writes SQL for **new
   codes only** (new `valid_from`), sets `valid_to` on deleted codes, and updates changed
   descriptions in place. CMS's addenda files (`icd10cm_order_addenda_<year>.txt`, the HCPCS
   "Transaction Report") list exactly these changes and are a cross-check.
3. Load it like a normal chunk set, then run the ingestion checks for every published state:
   codes the update deleted show up as "not in `ref_codes`".

CCSR: AHRQ publishes a new DXCCSR version each fiscal year (v2027.1 expected for FY2027 codes)
and sometimes a mid-year one. `ref_ccsr`'s key is (`code_norm`, `ccsr_category`) without the
release, so a new version needs the same kind of diff (rows to add, rows to delete, changed
defaults) rather than a full reload; build that with the first update. Until then, FY2027 codes
CCSR v2026.1 lacks take their parent prefix's groups.

## Format notes

- ICD-10-CM order file: fixed width, CRLF, ASCII. FY2027 added the first codes with a letter
  in 2nd place (`QA0`, `QA1`, after `Q99` in chapter 17); the parser and
  `packages/shared/src/codes.ts` allow only `QA` there and fail on anything new.
- HCPCS: 320-character records, Latin-1. Long descriptions continue on record id 4; modifiers
  (record ids 7 and 8) are skipped. Layout: `HCPC2026_recordlayout.txt` in the zip.

## CCSR format and storage

- DXCCSR CSV: CRLF, ASCII, 19 columns (code, description, inpatient default and description,
  outpatient default and description, six category/description pairs, rationale). Codes and
  category ids are in single quotes (`'F200'`; an empty slot is `' '`); text with a comma is in
  double quotes. The parser refuses a changed header, a wrong field count, a duplicate code, a
  malformed code or category, or a category with two descriptions.
- Default: we keep the **inpatient** default (`is_default = 1`). It is `XXX000` ("unacceptable
  principal diagnosis") for 10,843 codes, which then have no default row. The outpatient default
  (`XXX111` for 9,074 codes) is not stored.
- Body system names (`MBD` → "Mental, behavioral, and neurodevelopmental disorders") are not in
  the CSV; `src/ccsr.ts` has the 22 from the user guide's Table 1.
- **Prefix compression:** when every code in the file under a prefix (3+ characters) has the same
  categories and default, the shortest such prefix gets the rows instead of each code.
  `ccsrGroupsOf` in `packages/shared/src/ccsr.ts` reads them back by longest-prefix match. Every
  one of the 75,725 codes gets its own groups back (checked when building this release).
- CCSR keeps old codes that later became headers (`B880` beside `B8801`, `B8809`; 1,611 codes in
  the file have longer codes under them). Such a code keeps its own key when its groups differ.
