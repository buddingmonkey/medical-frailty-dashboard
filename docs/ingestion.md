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

**Implementation:** `runChecks` and `verifyConfirmations` in `packages/shared/src/checks.ts`
(pure functions; one test per row above). Definitions the table leaves open:

- A **code** is its code system, match kind, code and range end. The same code under two
  categories (MT `Z74.09`) is one code; moving it to another category is "category changed",
  not a removal plus an addition. A range `32851-32854` and an exact `32851` are different
  codes.
- **Invalid share** = invalid rows ÷ (valid + invalid rows). "Removed" = published codes the
  draft lacks ÷ published codes. "Row count change" compares entry rows.
- **Unknown ICD-10-CM** counts distinct codes, wildcard prefixes and range ends.
- A **duplicate** is the same code under the same category and subcategory.
- **Typed confirmations** must match the draft's state code (case and spaces ignored).
- The report **token** (publish only what was checked) is part of the publish route (roadmap
  M2 step 8).

The admin downloads the diff as CSV if they want to check it offline. The report is stored in
`dataset_versions.check_report_json`, and publishing requires the report's token, so the admin
cannot publish rows that changed after the checks ran.

Publishing, rollback and backups are described in `docs/data-model.md` ("Replacing a state's
list").

## Parser adapters (`apps/web/src/ingest/`)

Each adapter: `(file: File) => Promise<RawTable[]>` (one table per PDF page group or Excel sheet).

| Adapter | Library | Notes |
| --- | --- | --- |
| `xlsx` | SheetJS CE, installed from the official `cdn.sheetjs.com` tarball at a pinned version (0.20.3 is the newest, 2024-07-18) | **Not** the npm `xlsx@0.18.5` package, which is unmaintained and has known CVEs. **Not installed yet:** waiting on the project lead (status.md, open questions). Until then: paste the cells, or save as CSV |
| `csv` | native (`apps/web/src/ingest/parse.ts`) | RFC 4180 quoting, one linear pass, no regexes. `.txt` is read as tab-separated |
| `pdf` | `pdfjs-dist` (pinned, current) with `isEvalSupported: false` | Rebuilds rows from text positions: cluster by y, split columns by the x-positions of the header cells. Handles the wrapped descriptions in the GA/LA/MT PDFs (a line with no code is a continuation of the row above) |
| `json` | native | Accepts an array of objects with any keys; column mapping step decides which key is what |
| `paste` | native | Paste a tab-separated table straight from a spreadsheet |

Limits: 25 MB per file, 2,000 PDF pages, 100,000 rows, 100 columns. Parsing runs in a Web
Worker (`worker.ts`, started by `run-parser.ts`) so the page stays responsive and pdf.js runs
off the main thread; where there is no `Worker` (jsdom tests) the same adapters run directly.

Column mapping (`packages/shared/src/ingest.ts`): `guessColumnRoles` reads the header (tested
on the real GA, LA and MT headers), the admin confirms, and the profile is saved per state and
header layout (`column_profiles`). The qualification rule is one value for the file, or read
from the qualification or tier column, each value mapped by the admin; values left "Not set"
become `unknown`, and the screen lists them.

## Category auto-mapping

1. An exact match against existing `category_mappings` for the state (re-uploads).
2. The keyword table in `packages/shared/src/categories.ts` (`autoMapCategory`), tested
   against every LA and MT category: `SMI`, `DMD`, `mental` → `disabling_mental_disorder`;
   `SUD`, `substance` → `sud`; `IDD`, `SID`, `SDD`, `SPD`, `ADL`, `developmental`,
   `intellectual` → `physical_idd_adl`; `SCMC`, `ESRD`, `cancer`, `transplant`, `diabetes`,
   `neurolog`, `immun`, `infectious` → `serious_complex_medical`; `B` (whole label), `blind`,
   `disabled`, `disability` → `blind_or_disabled`; `temporar`, `ability to work`, `frailty
   indicator` → `state_specific`. Keywords match whole words or word starts (`immun` does
   not match "community"). The first match in table order wins; if other keywords disagree,
   confidence drops to 0.5. The subcategory is used only when the category matches nothing.
   The earlier draft keyword `disab` would have mapped LA "Temporary disabling" to
   blind-or-disabled; it was replaced (2026-11-01).
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
