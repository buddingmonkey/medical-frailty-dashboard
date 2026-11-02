# Data model

## Glossary

The design wiki says "type of code" for two different things. In code and docs we use:

| Term | Meaning | Examples |
| --- | --- | --- |
| **Code system** | The coding standard a code belongs to | ICD-10-CM (diagnoses), ICD-10-PCS, CPT, HCPCS Level II, NDC, revenue code, drug class (LA pharmacy `H2G`), other |
| **State category** | The label a state puts on a code, exactly as published | LA "SMI", "Temporary disabling"; MT "SCMC", "SID-SDD-SPD"; NE ICD chapter headings |
| **Federal category** | Our fixed list based on the H.R.1 medically frail definition. Each state category maps to one | See below |
| **Entry** | One row from a state's list: a code (or wildcard/range) + its state category + published text |
| **Dataset version** | One complete snapshot of a state's list, from one or more source documents |
| **Like code** | A code in a different code system that points at the same condition (e.g. an ICD-10 cancer diagnosis vs a CPT chemotherapy service) |

## Federal categories

Social Security Act §1902(xx)(9)(A)(ii)(V), added by Public Law 119-21 (H.R.1, 2025) §71119:
an individual "who is medically frail or otherwise has special medical needs (as defined by the
Secretary), including an individual" (verified against the enrolled law on govinfo, 2026-11-01;
link in `docs/sources.md`):

1. `blind_or_disabled`: (aa) "who is blind or disabled (as defined in section 1614)"
2. `sud`: (bb) "with a substance use disorder"
3. `disabling_mental_disorder`: (cc) "with a disabling mental disorder"
4. `physical_idd_adl`: (dd) "with a physical, intellectual or developmental disability that
   significantly impairs their ability to perform 1 or more activities of daily living"
5. `serious_complex_medical`: (ee) "with a serious or complex medical condition"

Labels, clauses and verbatim text live in `packages/shared/src/categories.ts`
(`federalCategoryInfo`). The short public labels are provisional (legal review).

Plus two of our own:

6. `state_specific`: the state uses a category that does not fit 1–5 (e.g. LA "Temporary
   disabling", MT Tier 2 "Frailty indicators")
7. `unmapped`: not yet reviewed by an admin. Shown publicly as "Unclassified"

## Tables (D1 / SQLite)

```
states              id (2-letter), slug (URL: lowercase postal code, `ga`), name, fips, status ('none'|'announced'|'published'),
                    published_version_id → dataset_versions, notes_md, updated_at

source_documents    id, state_id, title, url, publisher_date, retrieved_at,
                    file_type, sha256, r2_key, byte_size, uploaded_by

dataset_versions    id, state_id, version_no, status ('draft'|'published'|'superseded'|'discarded'),
                    label, effective_date, state_published_date (the state's date),
                    content_updated_at (our last-updated date), created_by, created_at,
                    published_by, published_at, check_report_json, row_count

version_sources     version_id, source_document_id          (many-to-many)
draft_parts         version_id, source_document_id, part, expected_entries, invalid_row_count,
                    named_state_ids_json   (one per table/sheet sent to a draft; PK of the first three)

entries             id, version_id, code_system, raw_code, code_norm, match_kind
                    ('exact'|'prefix'|'range'), range_end_norm, includes_children (0/1/null),
                    description_published, state_category, state_subcategory, tier,
                    attributes_json (rationale, yes/no, LA designation, ...),
                    qualification ('standalone'|'needs_support'|'supporting_only'|'unknown'),
                    qualification_basis ('published'|'inferred'), 
                    source_document_id, source_locator (page/sheet/row),
                    source_part (the table or sheet: `draft_parts.part`)

category_mappings   id, state_id, state_category, state_subcategory, federal_category,
                    method ('auto'|'manual'), confidence, mapped_by, mapped_at

ref_codes           code_system, code_norm, description, parent_norm, chapter, billable,
                    valid_from, valid_to  (ICD-10-CM and HCPCS Level II only, from public-domain
                    CMS files; WITHOUT ROWID, no extra index: packages/reference-data/README.md)

condition_groups    id, slug, name                          ("Malignant neoplasm", "ESRD / dialysis", ...)
condition_members   id, group_id, code_system, match_kind, code_norm, range_end_norm

column_profiles     id, state_id, header_key, profile_json, updated_by, updated_at
                    UNIQUE(state_id, header_key); what each column of a state's file means
app_meta            key, value                              (data_version, site settings)
audit_log           id, at, actor_email, action, target, details_json

watch_items         id, title, kind ('court'|'federal'|'state_list'|'internal'), state_id (nullable),
                    due_date, date_is_approximate (0/1), why_md, links_json,
                    status ('open'|'done'|'dismissed'), resolution_md, resolved_by, resolved_at,
                    repeat_days (nullable), created_by, created_at
entries_fts         FTS5 virtual table over (code_norm, raw_code, description_published);
                    external content (text lives in entries), kept in step by triggers
```

The schema is `apps/api/src/db/schema.ts` (Drizzle); `apps/api/migrations/` holds the SQL.
Rules the database itself enforces (tested in `apps/api/src/db/schema.test.ts`):

- Enum columns have CHECK constraints built from the lists in `packages/shared/src/enums.ts`.
- `state_subcategory` is `''`, never NULL, when a state has no subcategory, so the unique key
  on `category_mappings (state_id, state_category, state_subcategory)` works (SQLite treats
  NULLs as distinct).
- At most one `published` version per state (partial unique index), and `version_no` is
  unique per state.
- `range_end_norm` is set exactly when `match_kind = 'range'`.
- Deleting a version deletes its entries and `version_sources` rows (cascade); `entries_fts`
  follows through triggers.
- Dates are ISO-8601 text: `YYYY-MM-DD` for calendar dates, UTC with milliseconds for
  timestamps (`2026-11-01T21:04:05.123Z`). IDs are integers, except `states.id`.
- `states.published_version_id` and `dataset_versions.state_id` point at each other. Create
  the state first (no published version), then its versions.
- `content_updated_at` feeds `dateModified` and the sitemap `lastmod` (`docs/seo.md`). Set it
  on publish, and move it when an admin changes a mapping of that state.
- Code pages have no slug column: the URL is computed from the code system and code
  (`/codes/icd-10-cm/F20.0`) by a function in `packages/shared/codes.ts` (roadmap M1 step 2).
  Changing that function changes published URLs, so it needs 301s (`docs/seo.md`).

Every public query reads through `states.published_version_id`. Rows of drafts and old
versions sit in the same tables but are never visible publicly. This is what makes
overwriting a state safe: see "Replacing a state's list" below.

Category mappings belong to the state, not the version, so a re-upload with the same
category names keeps the admin's earlier remapping.

## Code normalization (`packages/shared/codes.ts`)

Pure functions, unit-tested against every pattern found in the seed files:

| Input seen | Normalized | Notes |
| --- | --- | --- |
| `F20.0`, `f20.0 `, `F200` | `F200` | Store without the dot, uppercase, trimmed. Display with the dot for ICD-10-CM (after char 3) |
| `A0103` (NE, no dots) | `A0103` | |
| `C34.x`, `K70.X`, `Q05.x` | prefix `C34`, `includes_children=1` | Wildcard |
| `Z89.*`, `F41.*-F42.*` (LA) | prefix `Z89`; prefix range `F41`–`F42` | Asterisk wildcard; a range whose ends are wildcards covers both whole categories |
| `32851–32854`, `33230 and 33240`, `E1037-E1224 and E1229-E1295` (NE) | separate entries | Split on `and`, commas and new lines first; en-dash and hyphen are both range marks |
| `912`, `0100` (LA revenue) | `0912`, `0100` | Revenue codes are 4 digits with leading zeros |
| `D57.0X` | prefix `D570` | Trailing X after digits is a wildcard, **except** ICD-10-CM 7th-character placeholders like `W01.0XXA`, which are exact codes. Check against `ref_codes` |
| `L89.500-L89...` | range `L89500`–? | Truncated range in the MT PDF. Flag for review; do not guess the end |
| `F20` (3-char category) | exact `F20`, `includes_children=null` | Unclear whether the state means only that code or the whole category. Flag; admin decides per state (a state-level default) |
| `28400` (5 digits) | CPT | `\d{5}` → CPT; `\d{4}[FTU]` → CPT Cat II/III/PLA; `[A-V]\d{4}` → HCPCS Level II; letter+digits pattern with ICD shape → ICD-10-CM; 3–4 digits → revenue |
| `S06.2*`, `D89.81*`, `I63.*` (LA) | prefix `S062`, `D8981`, `I63` | A wildcard can follow any position, not only the dot |
| `D80-D83` (LA) | range `D80`–`D83`, `includes_children=null` | Bare categories: flag `category_scope`, admin decides, as for `F20` |
| `M30-M31.*` (LA) | range of whole categories `M30`–`M31` | Wildcard on one end only: read as whole categories, flag `mixed_wildcard_range` |
| `E08.621-E08.622` (LA) | range `E08621`–`E08622` | Exact codes; covers only codes of the same length |
| `H2G`, `ZAF` (LA pharmacy) | drug class `H2G` | Same shape as an ICD-10-CM category (`C7A`), so the code system must come from the source's sub-category; never inferred |
| `C96.Z`, `F03.A2`, `M35.0B` (GA) | `C96Z`, `F03A2`, `M350B` | Letters can appear in any position after the first digit |

`parseCodeCell(raw, { system?, undottedIcd? })` in `packages/shared/src/codes.ts` implements this
table (tests: `codes.test.ts`, one row per pattern). Results are **codes** (ready to store),
**flags** on codes that need an admin's decision (`category_scope`, `system_ambiguous`,
`mixed_wildcard_range`), and **problems** that stop the row for manual entry
(`truncated_range`, `unclear_range`, `reversed_range`, `mixed_system_range`,
`system_mismatch`, `unrecognized`, `empty`). `undottedIcd` is a per-source setting (on for
NE): there, letter + 4 digits could be ICD-10-CM or HCPCS and is flagged until `ref_codes`
settles it. Elsewhere it is HCPCS. Matching ignores dots either way: NE `A0103` and a dotted
`A01.03` from another state share one `code_norm`.

**Coverage** (`entryCovers`): an exact entry covers itself, plus its children when
`includes_children = 1`; a prefix covers every code that starts with it; a wildcard range
compares each end against the code's leading characters (`F41.*-F42.*` covers `F41.1` and
`F42.9`); any other range compares whole codes of the same length (`32851`–`32854`).
`includes_children = null` counts as 0 until the admin sets a state default.

The code system comes from the source column when one exists (GA has "Code Type"). Otherwise
it is inferred from the pattern above. Ambiguous cases (HCPCS `J1234` versus an ICD-10-CM code
`J12.34`, which is dotted) are decided by whether a dot was present and by a `ref_codes` lookup,
and are flagged when still unclear.

## Matching across states

For a code X the search page shows each state as:

- **Listed exactly**: the state has an entry with `code_norm = X`
- **Covered by a broader entry**: a prefix/wildcard/range entry contains X, or the state lists
  an ancestor with `includes_children=1`
- **Narrower codes listed**: the state lists descendants of X but not X itself
- **Like code**: the state lists a code in another code system in the same condition group
- **Not listed**

"Confirmed" in the design wiki means the first two. The other states are shown separately and
labeled, so a "like" match never looks like an exact match.

### Like codes

There is no official crosswalk from ICD-10 diagnoses to CPT/HCPCS services. v1 uses
`condition_groups`, a small hand-curated list (cancer, ESRD/dialysis, transplant, SMI,
SUD, HIV, ...) that admins edit. ICD-10-CM members are prefixes (e.g. `C00`–`D49`); CPT/HCPCS
members are code ranges (e.g. chemotherapy administration `96401`–`96549`). Seed groups also come
from the state categories themselves (LA "Cancer" spans diagnosis, service and pharmacy codes).

## Qualification (does a code count on its own?)

States differ on whether a listed code is enough by itself. Each entry records:

| `qualification` | Meaning | Examples |
| --- | --- | --- |
| `standalone` | A matching claim is enough | MT both tiers; GA Attachment A; LA designation 0 (inferred) |
| `needs_support` | Counts only together with another code or documentation | GA Attachment B; LA designation 1 (inferred) |
| `supporting_only` | Evidence that supports another code; never enough alone | LA designation 2 (inferred) |
| `unknown` | The state does not say | NE ("might have to meet other criteria") |

`qualification_basis` is `published` when the state's own document says it, `inferred` when we
deduced it (LA, until LDH confirms). The site shows inferred values with a label. The tier label
the state uses (`tier`) is always shown as published. Set per state (or per tier/column value)
in the column-mapping step of ingestion; never guessed silently.

**Provisional (user, 2026-11-01):** the user's legal team may ask to remove the badges or
change their wording. Build for that:
- Badge labels and help text live in one file (`packages/shared/qualification.ts`), not in
  components.
- A site setting in `app_meta` (`show_qualification`: `all` | `published_only` | `none`) turns
  badges and the "qualifies alone" filter off, or hides only the inferred ones, without a
  deploy or a data change. Tests cover all three settings.
- The stored data (`qualification`, `qualification_basis`, `tier`) stays either way.

## Watch dates

Deadlines and re-check dates the admins must act on (court appeal windows, stays ending,
federal effective dates, re-checking a state's list). The admin page `/admin/watch`:

- Lists open items sorted by date, grouped as **Overdue**, **Due within 14 days**, **Later**,
  and **No date yet** (e.g. "waiting on LDH to confirm Code Designation").
- Shows "approximate" next to dates that are estimates (e.g. an appeal deadline before the
  judgment entry date is known).
- Each item has why it matters, links to sources, and a state if it is about one state.
- Closing an item needs a resolution note ("No appeal filed; checked PACER 2026-12-29"). The
  close is written to `audit_log`. Closed items stay visible under a "History" tab.
- `repeat_days` makes a recurring item: closing it creates the next one (e.g. re-check each
  state's source page every 90 days), `repeat_days` after the old due date, or after the
  close date (UTC) if that has already passed or there was no due date
  (`nextRepeatDate` in `packages/shared/src/watch.ts`).
- Links are http(s) only (zod), so a stored link cannot run script. "Why" and resolution notes
  are shown as plain text, despite the `_md` column names.
- Grouping uses the admin's local date; "due soon" is today through today + 14 days.
- Publishing a state version automatically creates (or moves) a "Re-check <state> list" item
  90 days later.
- Every admin page shows a small banner with the count of overdue and due-soon items, linking
  to `/admin/watch`.

Reminders outside the app (optional, later): the weekly cron could email the admins a digest
of due items through Cloudflare Email Routing (free, to verified addresses). Ask the user
before adding it.

## Replacing a state's list

States reissue their lists (MT's PDF says "Updated as of September 29, 2026"). A re-upload
never edits published rows in place:

1. The admin creates a **draft version** for one state and uploads all rows into it.
2. The API runs **data checks** and a **diff** against the published version (see
   `docs/ingestion.md`, "Checks before publishing").
3. **Publish** happens in one D1 `batch()` transaction: set the old version to `superseded`, the
   draft to `published`, move `states.published_version_id`, increment `data_version`, and
   write the audit row. Every statement in the transaction is limited to that one `state_id`.
4. Before publishing, the Worker writes a backup of that state's current published version to
   R2 (`backups/<state>/<version>.json`).
5. **Rollback** re-points `published_version_id` to any earlier version. Superseded versions
   are kept (they are small), so rollback needs no restore.
6. Unpublished drafts older than 30 days are deleted by a scheduled job (not built yet).

Built in M2 step 8 (`apps/api/src/routes/admin/drafts.ts`, `states.ts`). Publish needs the
checks token (the rows must be the ones checked) and every confirmation; duplicates (same
code, category, subcategory and tier) are merged in the same batch. Public queries read
through `publishedEntries()` (`apps/api/src/db/published.ts`), which the rollback test compares
row for row. A second publish at the same moment fails on the one-published-version index and
changes nothing.

No API route deletes or updates rows across more than one state. A test enforces that every
admin write query filters by `state_id` or `version_id`.

## Licensing of code text

- **ICD-10-CM / ICD-10-PCS** (CMS/NCHS) and **HCPCS Level II** (CMS) are public domain. We may
  load the official descriptions into `ref_codes`.
- **CPT** descriptors are © American Medical Association. We do **not** keep a CPT reference
  table. We show `description_published` exactly as the state printed it, always with a link to
  the state's source document, and the footer carries the AMA CPT notice. The user should get
  this approach checked before launch (open item in `docs/status.md`).
