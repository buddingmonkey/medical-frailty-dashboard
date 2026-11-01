# Data model

## Glossary

The design wiki says "type of code" for two different things. In code and docs we use:

| Term | Meaning | Examples |
| --- | --- | --- |
| **Code system** | The coding standard a code belongs to | ICD-10-CM (diagnoses), ICD-10-PCS, CPT, HCPCS Level II, NDC, revenue code, other |
| **State category** | The label a state puts on a code, exactly as published | LA "SMI", "Temporary disabling"; MT "SCMC", "SID-SDD-SPD"; NE ICD chapter headings |
| **Federal category** | Our fixed list based on the H.R.1 medically frail definition. Each state category maps to one | See below |
| **Entry** | One row from a state's list: a code (or wildcard/range) + its state category + published text |
| **Dataset version** | One complete snapshot of a state's list, from one or more source documents |
| **Like code** | A code in a different code system that points at the same condition (e.g. an ICD-10 cancer diagnosis vs a CPT chemotherapy service) |

## Federal categories

From H.R.1 (2025) §71119, an individual who is medically frail or has special medical needs,
including someone who is (verify the wording against the enacted statute in M1):

1. `blind_or_disabled`: blind or disabled
2. `sud`: has a substance use disorder
3. `disabling_mental_disorder`: has a disabling mental disorder
4. `physical_idd_adl`: has a physical, intellectual or developmental disability that
   significantly impairs one or more activities of daily living
5. `serious_complex_medical`: has serious or complex medical conditions

Plus two of our own:

6. `state_specific`: the state uses a category that does not fit 1–5 (e.g. LA "Temporary
   disabling", MT Tier 2 "Frailty indicators")
7. `unmapped`: not yet reviewed by an admin. Shown publicly as "Unclassified"

## Tables (D1 / SQLite)

```
states              id (2-letter), name, fips, status ('none'|'announced'|'published'),
                    published_version_id → dataset_versions, notes_md, updated_at

source_documents    id, state_id, title, url, publisher_date, retrieved_at,
                    file_type, sha256, r2_key, byte_size, uploaded_by

dataset_versions    id, state_id, version_no, status ('draft'|'published'|'superseded'|'discarded'),
                    label, effective_date, created_by, created_at,
                    published_by, published_at, check_report_json, row_count

version_sources     version_id, source_document_id          (many-to-many)

entries             id, version_id, code_system, raw_code, code_norm, match_kind
                    ('exact'|'prefix'|'range'), range_end_norm, includes_children (0/1/null),
                    description_published, state_category, state_subcategory, tier,
                    attributes_json (rationale, yes/no, LA designation, ...),
                    qualification ('standalone'|'needs_support'|'supporting_only'|'unknown'),
                    qualification_basis ('published'|'inferred'), 
                    source_document_id, source_locator (page/sheet/row)

category_mappings   id, state_id, state_category, state_subcategory, federal_category,
                    method ('auto'|'manual'), confidence, mapped_by, mapped_at

ref_codes           code_system, code_norm, description, parent_norm, chapter, valid_from, valid_to
                    (ICD-10-CM and HCPCS Level II only, built from public-domain CMS files)

condition_groups    id, slug, name                          ("Malignant neoplasm", "ESRD / dialysis", ...)
condition_members   group_id, code_system, code_norm or prefix

app_meta            key, value                              (data_version, site settings)
audit_log           id, at, actor_email, action, target, details_json

watch_items         id, title, kind ('court'|'federal'|'state_list'|'internal'), state_id (nullable),
                    due_date, date_is_approximate (0/1), why_md, links_json,
                    status ('open'|'done'|'dismissed'), resolution_md, resolved_by, resolved_at,
                    repeat_days (nullable), created_by, created_at
entries_fts         FTS5 virtual table over (code_norm, raw_code, description_published)
```

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
| `28400` (5 digits) | CPT | `\d{5}` → CPT; `\d{4}[FTU]` → CPT Cat II/III; `[A-V]\d{4}` → HCPCS Level II; letter+digits pattern with ICD shape → ICD-10-CM |

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
  state's source page every 90 days).
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
6. Unpublished drafts older than 30 days are deleted by a scheduled job.

No API route deletes or updates rows across more than one state. A test enforces that every
admin write query filters by `state_id` or `version_id`.

## Licensing of code text

- **ICD-10-CM / ICD-10-PCS** (CMS/NCHS) and **HCPCS Level II** (CMS) are public domain. We may
  load the official descriptions into `ref_codes`.
- **CPT** descriptors are © American Medical Association. We do **not** keep a CPT reference
  table. We show `description_published` exactly as the state printed it, always with a link to
  the state's source document, and the footer carries the AMA CPT notice. The user should get
  this approach checked before launch (open item in `docs/status.md`).
