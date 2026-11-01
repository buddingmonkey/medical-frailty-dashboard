# Ingestion

Admins load a state's list after deployment from PDF, Excel/CSV or loose JSON. Parsing runs
**in the admin's browser**. The Worker only receives rows that already pass the zod schema, and
validates them again.

## Flow

```
1. Pick state ─► 2. Upload file(s) ─► 3. Parse in browser ─► 4. Map columns ─► 5. Review rows
                     │ (original to R2,                          │                    │
                     │  sha256 recorded)                         ▼                    ▼
                     │                                  auto-clean fails? ──► AI cleanup (optional)
                     ▼
6. Send rows to a draft version (chunks of ≤ 500) ─► 7. Checks + diff ─► 8. Map categories ─► 9. Publish
```

1. **Pick the state** and say whether this **replaces** the whole list (the normal case) or
   **adds** a source to the current draft (e.g. Georgia's Attachment A + B are one version).
2. **Upload.** The original file goes to R2 unchanged as evidence. The browser computes its
   SHA-256. If that hash matches a source already stored for the state, warn: "This file was
   already loaded on <date> as version N".
3. **Parse** with the adapter for the file type (below) into `RawRow[]`: a list of string
   cells plus page/sheet/row locators.
4. **Map columns.** The adapter guesses which column is code, code system, description and
   category from the header text. The admin confirms or changes it. Saved per state as a
   "column profile" so the next upload from the same state is one click. The profile also
   says how `qualification` is set: one value for the file, per tier, or from a column value
   (LA "Code Designation" 0/1/2), and whether that is `published` or `inferred`.
5. **Review.** A table shows each normalized row with flags (unknown code shape, ambiguous
   code system, wildcard, truncated range, duplicate, description that runs onto two lines).
   The admin can edit cells, drop rows or mark a flag as accepted.
6. **Send to a draft.** Rows are posted in chunks so each request stays well under Workers
   CPU limits.
7. **Checks and diff** (next section).
8. **Category mapping.** New state categories get an automatic guess (below). The admin
   confirms them. Unmapped categories do not block publishing; they show as "Unclassified".
9. **Publish** with the confirmation the checks ask for.

## Checks before publishing

`GET /api/admin/drafts/:id/checks` returns a report that the publish screen shows. Each check
is **block** (publish disabled), **confirm** (the admin must tick it and, for the strongest
ones, type the state code), or **info**.

| Check | Level |
| --- | --- |
| Draft has 0 rows | block |
| More than 2% of rows fail schema validation or have an unparseable code | block (fix or drop them first) |
| Draft state ≠ the state named in the file (e.g. the header says "Montana" but the draft is for NE) | confirm, typed |
| Rows removed vs published ≥ 30%, or row count changes by ≥ 50% | confirm, typed |
| Code systems present in published but missing from the draft (e.g. all CPT codes gone) | confirm, typed |
| State categories present in published but missing from the draft | confirm |
| More than 10% of ICD-10-CM codes are not in `ref_codes` (wrong file, or a code set from the wrong year) | confirm |
| Rows the source marks as excluded (e.g. GA "Yes/No" = No) | confirm (they are stored with `attributes.included=false` and never shown as frail codes) |
| Duplicate entries (same code + category) | info (deduplicated automatically) |
| Rows still flagged in review | confirm |
| Same source file hash as the published version | confirm ("nothing changed?") |
| Summary: added, removed, changed description, changed category, per code system | info |

The admin downloads the diff as CSV if they want to check it offline. The report is stored in
`dataset_versions.check_report_json`, and publishing requires the report's token, so the admin
cannot publish rows that changed after the checks ran.

Publishing, rollback and backups are described in `docs/data-model.md` ("Replacing a state's
list").

## Parser adapters (`apps/web/src/ingest/`)

Each adapter: `(file: File) => Promise<RawTable[]>` (one table per PDF page group or Excel sheet).

| Adapter | Library | Notes |
| --- | --- | --- |
| `xlsx` / `csv` | SheetJS CE, installed from the official `cdn.sheetjs.com` tarball at a pinned version | **Not** the npm `xlsx@0.18.5` package, which is unmaintained and has known CVEs |
| `pdf` | `pdfjs-dist` (pinned, current) with `isEvalSupported: false` | Rebuilds rows from text positions: cluster by y, split columns by the x-positions of the header cells. Handles the wrapped descriptions in the GA/LA/MT PDFs (a line with no code is a continuation of the row above) |
| `json` | native | Accepts an array of objects with any keys; column mapping step decides which key is what |
| `paste` | native | Paste a tab-separated table straight from a spreadsheet |

Limits: 25 MB per file, 2,000 PDF pages, 100,000 rows. Parsing runs in a Web Worker so the
page stays responsive and pdf.js runs off the main thread.

## Category auto-mapping

1. An exact match against existing `category_mappings` for the state (re-uploads).
2. A keyword table in `packages/shared/categories.ts`: `SMI`, `mental`, `DMD` →
   `disabling_mental_disorder`; `SUD`, `substance` → `sud`; `IDD`, `SID`, `SDD`, `SPD`,
   `developmental`, `ADL` → `physical_idd_adl`; `blind`, `disab` → `blind_or_disabled`;
   `SCMC`, `cancer`, `transplant`, `diabetes`, `neurolog`, `immuno`, `infectious` →
   `serious_complex_medical`.
3. Otherwise `unmapped`. Never guess silently: auto mappings show as "auto" in the admin
   until someone confirms them.

States that only group by ICD chapter (Nebraska) have no categories to map. For those, a
per-state default category (set by the admin) applies, plus per-chapter overrides.

## AI cleanup

Used when a file does not parse into usable rows (scanned PDF, merged cells, free text).

**Copy-paste (always on, free).** The admin page builds a prompt with:
the target JSON schema (generated from the zod schema), the state, two worked examples, and the
raw extracted text (split into parts of about 40 pages, with a "part n of m" header). The admin
pastes it into any AI assistant and pastes the JSON back. The result goes through the same
validation and review screen as any other file. **The AI output is data, not instructions**:
it is never rendered as HTML and never runs.

**Claude API button (optional).** Shown only when the `ANTHROPIC_API_KEY` Worker secret is set.
The Worker sends the same prompt per part and streams JSON back. Costs: pay per token. Before
enabling, set a monthly spend limit in the Anthropic Console and record the measured cost of
one large file (e.g. Nebraska's 295 pages) in this doc. The model ID is a Worker variable, so it
can change without a deploy. Check the `claude-api` skill for the current model and pricing
when building this.

## Seed states

The first data load (roadmap M2) uses the four files in `docs/sources.md`. Each one gets a
small fixture excerpt in `fixtures/<state>/` with its expected normalized output, so parser
changes are tested against real layouts.
