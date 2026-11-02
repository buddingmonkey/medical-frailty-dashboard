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
   The admin can edit cells, drop rows or mark a flag as accepted. Details in "Review" below.
6. **Send to a draft.** Rows are posted in chunks so each request stays well under Workers
   CPU limits.
7. **Checks and diff** (next section).
8. **Category mapping.** New state categories get an automatic guess (below). The admin
   confirms them. Unmapped categories do not block publishing; they show as "Unclassified".
9. **Publish** with the confirmation the checks ask for.

## Review

`buildReview` (`packages/shared/src/review.ts`) runs `parseCodeCell` on each mapped row, with
the admin's edits applied, every time something changes; `ReviewTable.vue` shows the result.
Each row ends up in one of four states:

| Status | Meaning | What the admin does |
| --- | --- | --- |
| Cannot be read | `parseCodeCell` returned a problem (unrecognized code, truncated range, ...) | Edit the code (or its code system), or drop the row |
| Needs a decision | An open flag | `category_scope`: **Whole category** or **This code only** (sets `includes_children`). `system_ambiguous`: **ICD-10-CM** or **HCPCS**. `mixed_wildcard_range`, `multiline_description`: **Accept** |
| Ready | Nothing open | Nothing; notes (wildcard, duplicate, code system from the CMS lists, not in the CMS list) are shown but never block |
| Dropped | The admin dropped it | Restore if needed |

- **Code system** comes from, in order: the admin's edit, the source's code-system column
  (`codeSystemFromText`: "ICD-10", "CPT", "Revenue Code", ...; unknown text is noted and the
  code's shape decides), the code's shape.
- **Written without dots** (NE): a checkbox, first guessed from the file (`guessUndottedIcd`:
  more 6–7 character undotted ICD-10-CM codes than dotted codes).
- **CMS code lists.** The page looks up every exact ICD-10-CM and HCPCS code in `ref_codes`
  (`POST /api/admin/ref-codes/lookup`, 1,000 per request, each code once per page visit).
  When only one list has an ambiguous code, the review settles it (NE: 1,602 open questions
  → 102). Codes that are not in their system's list get a note and a "Not in the CMS lists"
  filter: LA's drug classes (`H2G`), outdated codes (NE `T40.4X1A`).
- **Bulk actions** apply to every row the filters show (status, category / subcategory,
  search in code, description or page): set the code system (LA Pharmacy → Drug class),
  answer the category question, accept flags.
- **Edits** are kept per row key (the locator, `#2` for a repeat) and start over for each
  new table. A row's edit holds only the fields that differ from the file.

## Checks before publishing

`GET /api/admin/drafts/:id/checks` returns a report that the publish screen shows. Each check
is **block** (publish disabled), **confirm** (the admin must tick it and, for the strongest
ones, type the state code), or **info**.

| Check | Level |
| --- | --- |
| Draft has 0 rows | block |
| A part has fewer entries stored than the browser announced (an upload that stopped half way) | block (send that part again) |
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
- A **duplicate** is the same code under the same category, subcategory and tier (GA lists some
  codes in both Attachment A and B; those are two tiers, not a duplicate). Publish keeps the
  first and deletes the rest.
- **Typed confirmations** must match the draft's state code (case and spaces ignored).
- The report **token** (publish only what was checked) is part of the publish route (roadmap
  M2 step 8).

The admin downloads the diff as CSV if they want to check it offline. The report is stored in
`dataset_versions.check_report_json`, and publishing requires the report's token, so the admin
cannot publish rows that changed after the checks ran.

## Sending to a draft (`SendToDraft.vue`, `/admin/drafts/:id`)

- `toDraftEntries` (`packages/shared/src/drafts.ts`) turns the review into entries: one per
  code (a cell with `33230 and 33240` gives two), dropped rows left out, rows that cannot be
  read counted as invalid. Open review flags travel in `attributes.flags`; GA's "Yes/No" in
  `attributes.included`; the rationale in `attributes.notes`; LA's raw designation in
  `attributes.qualificationValue`. Column roles `Included (Yes/No)` and `Notes / rationale`
  read these from the file.
- The **source document** is found by the file's SHA-256 among the state's stored files; a
  file not stored yet must be stored on "Source files" first (its title, URL and date are the
  citation). A pasted table picks a stored file by hand.
- The **part** is the parser's table name (`Pages 2–294`, `Sheet1`, `Pasted table`). One file
  can give several parts (NE's PDF: the ICD table and the CPT/HCPCS page); sending a part
  again replaces only that part. A draft can hold parts of several files (GA A + B).
- **States named in the file** (`findNamedStates`): the file name, the PDF's title text
  (lines before the first table, `titleText` from the PDF adapter), table names, headers and
  the first 10 rows. Longer names win ("West Virginia" is not also Virginia).
- Upload: create the draft (if new) → `PUT` the part → `POST` rows in chunks of 500. A failure
  shows the error; sending again starts that part over in the same draft.
- The draft page shows the parts, the checks by level, the diff per code system, a paged list
  of changes, a CSV download (cells that start with `=`, `+`, `-` or `@` get a leading `'` so
  a spreadsheet does not run them), and Discard.

Publishing, rollback and backups are described in `docs/data-model.md` ("Replacing a state's
list").

## Parser adapters (`apps/web/src/ingest/`)

Each adapter: `(file: File) => Promise<RawTable[]>` (one table per PDF page group or Excel sheet).

| Adapter | Library | Notes |
| --- | --- | --- |
| `xlsx` | `read-excel-file` (npm, MIT, pinned), its `/web-worker` build | Chosen over SheetJS by the project lead (2026-11-01): SheetJS CE is only on its own CDN, and the npm `xlsx@0.18.5` is unmaintained with known CVEs. Every sheet becomes a table; numbers are kept as the cell's text (`parseNumber`), dates as `YYYY-MM-DD`. Old `.xls` is not supported |
| `csv` | native (`apps/web/src/ingest/parse.ts`) | RFC 4180 quoting, one linear pass, no regexes. `.txt` is read as tab-separated |
| `pdf` | `pdfjs-dist` (pinned, legacy build), in a worker it starts from ours | See "PDF adapter" below |
| `json` | native | Accepts an array of objects with any keys; column mapping step decides which key is what |
| `paste` | native | Paste a tab-separated table straight from a spreadsheet |

Limits: 25 MB per file, 2,000 PDF pages, 100,000 rows, 100 columns. Parsing runs in a Web
Worker (`worker.ts`, started by `run-parser.ts`; module format, so pdf.js's 1.7 MB chunk loads
only for a PDF) so the page stays responsive and pdf.js runs
off the main thread; where there is no `Worker` (jsdom tests) the same adapters run directly.

### PDF adapter

`pdf.ts` extracts each text run (text, x, y, width, height, font); `pdf-layout.ts` rebuilds
the tables. Tested on synthetic pages and on real pages of all four seed states
(`fixtures/pdf-pages-*.json`, text runs only, written by `fixtures/pdf-pages.make.test.ts`).

1. **Lines:** runs whose baselines are within half a text height.
2. **Header:** the first line with two or more cells, one naming a code column
   (`guessColumnRoles`), and above the first line holding a code (GA data lines say
   "ICD-10-CM"). Up to two lines below it in the header's font and without codes join it (LA's
   "Code / Designation"). Lines above the header (titles, NE's chapter names) are skipped, and
   so are page-number lines ("Page 2 of 295") and pages before the first header (NE's
   contents page). A header that repeats continues the table; a different one starts a new
   table (NE: ICD pages, then the CPT page).
3. **Columns, per page:** cells are left-aligned, so the x where runs start cluster at the
   column edges; the clusters on the most lines win. Headers are not used for edges because
   LA centers them (its "Code" header starts 29 pt right of the codes), and GA's columns move
   from page to page. A run goes to the last column that starts at or before it, so GA's
   centered codes and LA's one code printed far right still land in the code column. LA's
   printer sometimes wrote two cells as one run ("… 5HT M H7X", "0 Bronchiectasis"): a run that
   crosses into an empty column is split at the space nearest the edge, only if the split
   leaves a code on the right or one word on the left. Text that overflows under the next
   column (clipped on paper) stays whole.
4. **Rows:** one per line with a code. A code ending in a comma, hyphen or "and" on a line of
   its own continues ("33927, 33928, 33929," / "33935, 33945"); NE's "E09.349," has a
   description on its line, so it is a stray comma. The lines without a code between two codes
   go to the row above, the row below, or rarely a row of their own. Each gap is split to make
   the rows most row-like: no value written twice ("Tier 1 … Tier 1 …"), no empty column that
   nearly every row fills, no cell that starts in lower case. The splits are chosen for the
   whole table at once (dynamic programming), because one file can mix alignments: MT puts the
   code at the top of some rows and at the bottom of others. A row of its own is kept only
   when joining it would write a value twice (GA-B page 60 has a row with no code).
5. **Wrap direction** breaks ties: "above" (Excel's default bottom alignment: GA, MT, NE) or
   "below" (LA). It is detected from lower-case continuations, line spacing and page
   starts/ends; the admin can force it on the page ("Wrapped lines"), which also turns the
   per-gap weighing into a fixed rule.

Results on the full files (2026-11-02): GA-A 1,686 rows, GA-B 4,488 (one without a code), LA
2,526, MT 314, NE 8,146 ICD + 27 CPT/HCPCS rows; every column's values consistent (one tier
and category per MT row, LA designations only 0/1/2 or blank where the source is blank).
Reading LA's 73 pages takes under a second in Chromium.

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

**Built in M2 step 9.** Publish stores the keyword guess for every new category
(`method = 'auto'`, never over an existing mapping). `/admin/categories` lists the categories of
the published version and open drafts with their counts, the stored mapping or guess, and
"Confirm" per row or "Confirm all guesses"; confirmed mappings are `manual`. The default for a
state without categories is simply the mapping of its blank category ("(no category)").
Chapter overrides live in `chapter_mappings`. The rule, in `federalCategoryOf()`
(`packages/shared/src/category-mapping.ts`): a chapter override (ICD-10-CM entries only) wins,
then the category mapping, else `unmapped`. Every change moves the published version's
`content_updated_at` and bumps `data_version`.

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
