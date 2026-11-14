# Data model

## Glossary

The design wiki says "type of code" for two different things. In code and docs we use:

| Term | Meaning | Examples |
| --- | --- | --- |
| **Code system** | The coding standard a code belongs to | ICD-10-CM (diagnoses), ICD-10-PCS, CPT, HCPCS Level II, NDC, revenue code, drug class (LA pharmacy `H2G`), other |
| **State category** | The label a state puts on a code, exactly as published | LA "SMI", "Temporary disabling"; MT "SCMC", "SID-SDD-SPD"; NE ICD chapter headings |
| **Federal category** | Our fixed list based on the H.R.1 medically frail definition. Each state category maps to one | See below |
| **Entry** | One row from a state's list: a code (or wildcard/range) + its state category + published text |
| **Comparison category** | The public name of a **unified category** (below): this site's own grouping, built from CCSR groups, that every state's list is measured against. Never "unified" on a public page (M6 step 3b) | "Serious mental illness", "Cancer" |
| **Includes** | A state's list **includes** a code when it lists the code itself or a wildcard or range covers it ("listed or covered"). Every public count of states ("3 of 4 states", "Only Georgia includes") counts this, out of the states with a list on this site. A narrower code does not include its parent | `F31.*` includes F31.2 |
| **Reference list** | The public name of a comparison category's **universe**: the billable ICD-10-CM codes of its CCSR groups. The overview's share is of this list; a category without one is marked † | 158 codes for MBD001–MBD003 |
| **State's rule** | The public name of an entry's **qualification**: whether the state says the code is enough by itself. Never "qualifies" on a public page (it reads as a member's eligibility) | "Enough by itself", "Supporting only" |
| **Review status** | Whether an admin has reviewed how a state category maps (public "Reviewed" / "Not yet reviewed (automatic suggestion)"; `confirmed` in the API). Not the code page's "Included" | |
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
7. `unmapped`: not yet reviewed by an admin. Shown publicly as "Not yet classified";
   `state_specific` is shown as "State's own category (not in the law)"

**Which federal categories an entry counts under** (M5 step 5b, project lead 2026-11-02:
"Federal category should be pre mapped. It's the non-federal we have to manage";
`federalCategoriesOf()` in `packages/shared/src/category-mapping.ts`, one rule for admin and
public pages):

1. **Entries the state gave federal categories** (`entries.state_federal_categories`, project
   lead 2026-11-13; Indiana publishes one per code, 3 rows name two): exactly those, ahead of
   everything below. Only the five law categories; never `state_specific` or `unmapped`.
   Read by the ingest column role "Federal category (the state's own)" (`docs/ingestion.md`).
2. **Placed entries** (rows in `entry_unified`, below): the distinct federal parents
   (`unified_categories.federal_category`) of the **published** unified categories the entry is
   placed in. A code in two unified categories with different parents counts under **both**.
   Admins manage only state → unified; each unified category's parent is fixed.
3. **Entries placed nowhere** fall back to the M2 rule: an ICD-10-CM chapter override of the
   state (`chapter_mappings`) wins, then the mapping of the entry's state category
   (`category_mappings`), else `unmapped`.

What this means where counts are shown:

- `byFederalCategory` (home map card, state pages) counts an entry once under **each** of its
  federal categories, so the counts can add up to more than the entries; the pages then say "A
  code can count under more than one federal category" (`FEDERAL_OVERLAP_NOTE`,
  `federalCountsOverlap`). A state page's category table has one row per state category and
  federal category.
- Downloads: the CSV column is `federal_categories` (labels joined by `; `), the JSON field
  `federalCategories` (a list). The code-table CSV's per-state column likewise.
- The code table (`/compare/codes`) shows an entry in the table of **any** of its federal
  categories; "filed under" names the state's category, or the federal labels joined by `; `.
- **Confirmed** (state pages, `mappingsConfirmed`): an entry with state-published federal
  categories is always confirmed, and its category rows show "Stated by the state" (`stated` in
  the API, provisional wording) when every entry in the row is stated. Otherwise a placed entry is
  confirmed when every one of its placements is reviewed (`entry_unified.reviewed`); an unplaced one when its M2 mapping is
  `manual` or a chapter override applies. A state's mappings are confirmed when all its entries
  are.
- Public reads stay lookups: the entry's own `state_federal_categories` column
  (`stateFederalSql`), plus two correlated subqueries per entry on `entry_unified` joined to
  `unified_categories` (`apps/api/src/db/federal.ts`), never CCSR work per request.
- The admin categories screen shows, per state category, how many published entries the state
  gave federal categories ("stated by the state") and how many follow their unified categories,
  and under which federal categories; its mapping covers the rest. The bulk remap preview says
  which entries stay because the state named their federal category.
- A changed state federal category shows in the draft diff as a category change: the label
  becomes "Category (state's federal category: …)".

## Unified categories (M5)

Three levels (project lead, 2026-11-02): **federal** (the law, above), **unified** (curated by
admins, e.g. "Serious mental illness", "Chronic kidney disease and kidney failure") and **state**
(each state's own categories, exactly as written). Unified categories are what the many-state
views compare; public pages call them **comparison categories** (glossary).

```
unified_categories   id, slug (unique; URL /compare/<slug>), label, definition, includes, excludes,
                     federal_category (any but 'unmapped'; the parent shown in the overview),
                     status ('draft'|'published'|'retired'), version (+1 on each edit of label,
                     definition, includes or excludes), sort_order,
                     created_by, created_at, updated_by, updated_at
unified_ccsr         unified_id → unified_categories, ccsr_category (e.g. 'MBD001')   PK both
                     (the CCSR groups whose ICD-10-CM codes belong to the category; codes come
                     from ref_ccsr in step 2)
unified_mappings     id, state_id, state_category, state_subcategory,
                     unified_id → unified_categories (NULL only for 'by_code'),
                     relation ('exact'|'close'|'broad'|'narrow'|'related'|'by_code'),
                     basis ('state_text'|'admin_judgement'|'ccsr_agreement'|'inferred'),
                     confidence ('high'|'medium'|'low'), rationale, citation,
                     mapped_by, mapped_at, reviewed_by, reviewed_at,
                     status ('proposed'|'approved'|'superseded'), superseded_by → unified_mappings
```

- The slugs `codes` and `states` are reserved (`reservedUnifiedSlugs` in
  `packages/shared/src/unified.ts`): `/compare/codes` is the code table (M5 step 5),
  `/compare/states/…` the state comparison (M5 step 7). The schema refuses them; the API says why.
- Relations follow SKOS: `exact` (the same set), `close` (nearly), `broad` (the unified category is
  broader than the state's), `narrow` (narrower), `related`. `by_code` means "this state category
  is not a meaningful group (GA and NE have none): place each code by its CCSR group".
  CHECK: `(relation = 'by_code') = (unified_id IS NULL)`; `status = 'approved'` needs
  `reviewed_by` and `reviewed_at`.
- One state category may map to several unified categories (one row per target). Rows are never
  deleted: a change marks the old row `superseded` and points `superseded_by` at the new one.
- One admin may approve (project lead, 2026-11-02); the public pages say who reviewed it and when.

**Which unified categories an entry counts under** (`unifiedOf()` in
`packages/shared/src/unified.ts`, one rule for admin and public pages):

1. Take the approved mappings of the entry's state category (`mappingKey()`).
2. Label targets (rows with a `unified_id`): one target → that one. Several → the targets whose
   CCSR groups include one of the entry's CCSR groups (ICD-10-CM only); none match, or not
   ICD-10-CM → all targets. Basis `mapping`.
3. Otherwise (an approved `by_code` row, or no approved mapping yet): ICD-10-CM entries go to every
   unified category whose CCSR groups include one of the entry's; basis `by_code`, reviewed only
   if a `by_code` row is approved. Other code systems → none ("Not yet classified").
4. Public pages use published unified categories only; retired ones never count.

The entry's CCSR groups come from a lookup passed in (step 2 builds `ref_ccsr`); a wildcard or
range entry takes the groups of the codes it covers. The entry's **federal** categories follow
these placements since M5 step 5b ("Federal categories", above).

**Full code lists.** A unified category's universe of ICD-10-CM codes is every code in its CCSR
groups. The drill-down uses it to show codes no state lists (roadmap M5 step 6). Other code
systems have no universe: only codes some state lists are shown.

### CCSR reference data

AHRQ's CCSR for ICD-10-CM (v2026.1, `packages/reference-data`; licence and citation in its
README) puts each code in 1–6 of 553 categories, with a default. `ref_ccsr_categories` holds the
names; `ref_ccsr` the code-to-category rows, with `is_default = 1` on CCSR's **inpatient**
default (none when that is `XXX000`, "unacceptable principal diagnosis": 10,843 codes).

- **Stored by prefix** (D1 free tier: 100k row writes a day): when every code in the file under a
  prefix of 3+ characters has the same categories and default, the shortest such prefix gets the
  rows. 87,705 code rows become 66,209.
- **Lookup** (`ccsrLookupPrefixes`, `ccsrGroupsOf` in `packages/shared/src/ccsr.ts`): try the
  code, then each shorter prefix down to 3 characters; the first with rows gives the groups.
  This returns every code in the file its own groups, and gives a newer code CCSR lacks its
  parent's groups.
- A **header** code whose children differ (`F31`) finds nothing by that rule: like a wildcard,
  it takes the groups of the codes under it (`ref_ccsr` keys starting with it).
- CCSR keeps some old codes that are headers in FY2027 (`C860` beside `C8600`…). Such a code has
  its own key with the old code's groups; an entry listing it as a header should use the codes
  under it instead.
- The universe of a CCSR group (above) is every `ref_codes` ICD-10-CM code whose lookup includes
  the group.

### Coverage summary (M5 step 4)

Public pages must not place thousands of entries in Worker JavaScript (the Free plan allows
10 ms of CPU per request; D1 time does not count). Admin writes place them once, and public
routes read the rows with SQL aggregates.

```
entry_unified     entry_id → entries (ON DELETE CASCADE), unified_id → unified_categories,
                  basis ('mapping'|'by_code'), reviewed (0/1)
                  PK (entry_id, unified_id); WITHOUT ROWID, no other index
unified_universe  unified_id → unified_categories (ON DELETE CASCADE), code_norm
                  PK (unified_id, code_norm); WITHOUT ROWID, no other index
```

- **Placements** (`entry_unified`, `apps/api/src/db/placement.ts`): rows exist only for entries of
  **published** versions, in **published** unified categories, by `unifiedOf()`. An entry's CCSR
  groups are `ccsrGroupsCovered` (codes, headers, wildcards, ranges), read with the same helper as
  the mapping screen (`apps/api/src/db/ccsr.ts`).
- **Recomputed** right after: a publish or rollback (that state); a mapping approval (that
  state; a proposal changes nothing); creating a published category with CCSR groups, or changing a
  non-draft category's CCSR set or status (every state with a list). Only the difference is
  written (deleted and upserted rows, 1,000 per statement as one JSON parameter), in one batch,
  plus a second `data_version` bump when anything changed, so a page cached between the
  route's batch and the recompute is never read again. Nebraska (8,182 entries) takes about
  0.1 s locally, writes included.
- **Universe** (`unified_universe`): every **billable** ICD-10-CM code of the current release
  (`ref_codes`, `valid_to` NULL) whose CCSR groups, by the longest-prefix rule, meet the
  category's set. Written in SQL (`INSERT … SELECT`, only rows that change) in the same batch
  as the CCSR set; kept for drafts too (admin previews), never shown for them. The
  schizophrenia, depression and bipolar groups (MBD001–MBD003) give 158 codes. A new CCSR or
  ICD-10-CM release does not rewrite universes yet (open question).
- No index on `entry_unified.unified_id`: every read goes from entries to placements (the
  primary key), and unified categories are never deleted.

**Coverage** (`GET /api/public/overview`), per state and published unified category:

- **Entries**: the state's published entries placed in the category (a code, wildcard or range
  each). **Qualifying alone**: those marked `standalone`, and their share of the entries.
- **Universe categories** (some CCSR group, so a universe): **covered** is the number of universe
  codes the placed ICD-10-CM entries cover, by `entryCovers`: an exact code covers itself (and
  its children when `includes_children = 1`), a prefix every code that starts with it, a
  wildcard range every code whose leading characters fall between its ends, any other range the
  codes of the same length between its ends. **Share** = covered / universe size. Entries in
  other code systems count as entries but cover no universe code.
- **Other categories** (no CCSR group): **covered** is the state's distinct entries in the
  category (spelled as `comparePatternKey`, so `F10` with children equals `F10*`), and
  **share** = that over the distinct entries of every state together.
- **Reviewed**: every placement in the cell is reviewed (false when the state has none).
- States without a list have no cells.

**The overview matrix** (`/compare`, M5 step 5; helpers in `packages/shared/src/overview.ts`, used
by the Vue page and the server-rendered HTML): a cell shows the share as a whole percentage
(never 0% above zero, never 100% below one) and a shade: 75% or more, 25–74%, 1–24%, none
(hatched). **Overall** is the plain average of the state's category shares (categories with no
denominator left out), so every category counts the same. "Similar states together" is greedy
nearest-neighbour seriation on the share vectors (squared distance), starting from the highest
overall, ties by overall then name; states without a list always come last, by name. A cell is
marked "not reviewed" when it has entries and not every placement is reviewed.

### Drill-down (M5 step 6)

`/compare/<slug>` shows one published unified category's codes (`apps/api/src/db/public-drill.ts`,
helpers in `packages/shared/src/drill.ts`):

- **Rows**: every distinct entry placed in the category (`entry_unified`), spelled as
  `comparePatternKey` (so a wildcard or range is its own row), plus, with "Include codes no
  state lists" (`all=1`, only when the category has a universe), every universe code that is
  not a row yet. Such a code shows its real count: 0 when no state lists or covers it, more when
  a state's wildcard or range covers it.
- **Count** ("37 of 44 states"): states **with a list** whose whole published list has an
  entry that lists the row exactly or covers it, by "Matching across states" (the M4 rules: a
  wildcard row is covered only by a wildcard or range containing all of it; narrower codes do
  not count). Each state counts once, with the entry M4 would show (listed before covered, then
  the rule that qualifies most on its own); "their rules" counts those entries per
  qualification, with how many are inferred.
- **Groups**: the ICD-10-CM 3-character category of the row's first code (`F31.*–F32.*` goes
  under F31), other code systems one group each. A group's "N of M list any" counts states
  listing or covering any of its rows, whatever the filter. Groups by that count, then code
  system and key; rows by count, then code system, code, kind and range end
  (`compareDrillGroups`, `compareDrillRows`).
- **Filters**: everyone (count = M, M > 0), gaps (count < M / 2), only one state (count = 1);
  a code system. A group shows when the filter keeps one of its rows.
- **Pages**: a page holds the groups that start within its first 250 rows (a group is never
  split), so a page has about 250 rows.
- **In SQL**: each row's covering entries are found per prefix of the code in the published
  wildcards (read once, then looked up; joining all entries per prefix made SQLite scan every
  published entry and took 3 s for cancer), the few ranges checked directly, exact keys by
  index. The Worker shapes one page only.

### Pair similarity (M5 step 7)

How alike two states' published lists are, for "States with the most similar lists" on each
state page and the two-state comparison (`apps/api/src/db/similarity.ts`).

```
state_similarity  state_a → states, state_b → states (state_a < state_b), shared, only_a, only_b,
                  jaccard (REAL, 0–1), computed_at (when the row's numbers last changed)
                  PK (state_a, state_b); WITHOUT ROWID, no other index; at most 1,275 rows
```

- **A state's set of codes**: every **billable** ICD-10-CM code of the current release
  (`ref_codes`, `valid_to` NULL) that one of its published ICD-10-CM entries lists or covers by
  `entryCovers` (an exact code itself, with its children when `includes_children = 1`; a prefix
  every code under it; a wildcard range every code whose leading characters fall between its
  ends; another range the codes of the same length between its ends), plus its entries in
  other code systems, each counted once by `comparePatternKey`. A header code listed without
  its children, or a code missing from `ref_codes` (deleted, invalid), adds nothing.
- **Similarity** = Jaccard index = shared / (shared + only_a + only_b); 0 when both sets are empty.
- **Recomputed** right after a publish or rollback (that state's pairs, after
  `recomputePlacements`); mapping approvals and category changes never change it (they do not
  change what a state lists). Only changed rows are written, with a `data_version` bump when any
  are. Migration `0010_state_similarity` fills every pair from the lists already published (the
  same statement, checked by `src/db/similarity.test.ts`). A new ICD-10-CM release does not
  recompute it yet (with the update tooling, like placements).
- **In SQL**: each published entry finds its codes by a primary-key range scan of `ref_codes`
  (entries read first, MATERIALIZED, then CROSS JOIN, so SQLite never scans `ref_codes` per
  entry of every version); `sets` (state, code) is materialized once and the target state's
  codes are joined to it on code. Locally, Nebraska (8,182 entries) against the other three
  seed states: about 50 ms, 3 rows written, ~293k rows read; 51 states (simulated by pointing
  every state at one of the four lists): 0.5 s per state, 2.7 s for every pair.

### Compare states (M5 step 7)

`/compare/states/<st>-vs-<st>[-vs-<st>…]` compares 2–4 states, in column order
(`apps/api/src/db/public-states-compare.ts`, helpers in `packages/shared/src/states-compare.ts`):

- **Rows**: every distinct entry of the chosen states' published lists (`comparePatternKey`).
  Each chosen state's cell is the drill-down's (listed, covered by a broader entry, narrower codes
  listed, not listed), by "Matching across states", among the chosen states only.
- **Differs** (`statesCompareDiffers`): the chosen states disagree on listed-or-covered (narrower
  codes do not count as listed), or all of them list or cover it but the entries their cells
  show have different rules (qualification). "Show only differences" (default; `diff=0` turns
  it off) keeps those rows.
- **Groups**: a row is in every **published** unified category one of its own entries is placed
  in (`entry_unified`), so a code can show in two groups; rows placed nowhere go in a last group,
  "Not in a unified category". Groups in the overview's order (federal parent, sort order, label).
  A group header gives, per state, the group's rows it lists or covers (whatever the filter),
  and how many of them differ.
- **Summary** (over every row, each once): per state the rows only it lists or covers among the
  chosen states; the rows all of them list or cover; for exactly two states their stored pair
  similarity. These counts are rows (entries), not the expanded codes of the similarity.
- **Pages**: each group's rows (code order) in parts of 250; a page holds the parts that start
  within its first 250 rows, so a group is split only when it is longer than a page (marked
  "continued").
- A chosen state without a list: nothing is compared, the page says so. An unknown state, one,
  five or a repeated state: 404.

### Tile map (M5 step 8)

"One category across the country" on the home page (`apps/web/src/components/home/CategoryTileMap.vue`,
helpers and layout in `packages/shared/src/tile-map.ts`): one published unified category at a
time, read from `GET /api/public/overview` (no new query; the server-rendered home page calls the
same loader, and the page is cached on `data_version`).

- **Layout** (`usTileLayout`): 51 equal tiles on an 11 × 8 grid (the approved mockup), each with
  its postal code and a fallback name for a state the overview does not send.
- **A tile**: the overview's number and band (`coverageBand`); "none" (hatched) when the state
  has a list but no entry in the category; "No list" (the no-list shade, not a link) when it has
  no list; `*` when not reviewed. A tile with a list links to `/compare/<slug>?focus=<ST>`. Its
  accessible name is the overview cell's (`overviewCellLabel`); only the number is link text (the
  link covers the tile), so the visible words are in the name (axe `label-content-name-mismatch`).
- **Reading order**: the tiles are a list in order of state name; CSS grid (`row-start-*`,
  `col-start-*`) places them on the map. Below it, `<details>` "Show as a table" holds the same data.
- **Category**: `?category=<slug>`; the default (left out of the URL) is the first category in
  the overview's order (federal parent, sort order, label). The section is absent when no category
  is published.
- **Server-rendered HTML**: the chosen category as a plain table (every state and DC by name),
  not the visual grid, and the picker as a GET form, so it works without JavaScript.

## Tables (D1 / SQLite)

```
states              id (2-letter), slug (URL: lowercase postal code, `ga`), name, fips, status ('none'|'announced'|'published'),
                    published_version_id → dataset_versions, notes_md, updated_at

source_documents    id, state_id, title, url, publisher_date, retrieved_at,
                    file_type, sha256, r2_key, byte_size, uploaded_by

dataset_versions    id, state_id, version_no, status ('draft'|'published'|'superseded'|'discarded'),
                    label, effective_date, state_published_date (the state's date),
                    content_updated_at (our last-updated date), created_by, created_at,
                    updated_at (last draft activity; NULL before 0015 → read created_at),
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
                    source_part (the table or sheet: `draft_parts.part`),
                    state_federal_categories (the state's own federal categories for the row,
                    e.g. Indiana's "Federal category" column: law categories in federal order
                    joined by ",", NULL for none; a column CHECK, migration 0016, allows only
                    the five law categories, each once)

category_mappings   id, state_id, state_category, state_subcategory, federal_category,
                    method ('auto'|'manual'), confidence, mapped_by, mapped_at
chapter_mappings    state_id, chapter (1–22), federal_category, mapped_by, mapped_at
                    (ICD-10-CM chapter overrides; PK state_id + chapter)

ref_codes           code_system, code_norm, description, parent_norm, chapter, billable,
                    valid_from, valid_to  (ICD-10-CM and HCPCS Level II only, from public-domain
                    CMS files; WITHOUT ROWID, no extra index: packages/reference-data/README.md)
ref_ccsr_categories ccsr_category (PK, 'MBD001'), description, body_system, release ('ccsr-dx-2026.1')
ref_ccsr            code_norm (ICD-10-CM code or prefix), ccsr_category, is_default (0/1), release
                    PK (code_norm, ccsr_category); WITHOUT ROWID, no extra index; stored by prefix
                    ("CCSR reference data" above)
entry_unified       entry_id, unified_id, basis, reviewed      (placements; "Coverage summary")
state_similarity    state_a < state_b, shared, only_a, only_b, jaccard, computed_at  ("Pair similarity")
unified_universe    unified_id, code_norm                       (universes; "Coverage summary")

condition_groups    id, slug, name, definition, sources, status ('draft'|'published'),
                    updated_by, updated_at                  ("Cancer and chemotherapy", ...; "Like codes")
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
ref_codes_fts       FTS5 virtual table over ref_codes (description, code_norm; code_system and
                    valid_from unindexed); its own copy of the text (ref_codes is WITHOUT ROWID),
                    kept in step by triggers; ~25 MB and ~219k shadow rows for 107k codes (0012)
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

The compare table (M4) uses the same words per cell, with rows that may be wildcards or ranges:
a state covers a wildcard row only with a wildcard or range that contains all of it (a single
`F10` never covers `F10.*`; it shows as a narrower code). Two spellings of one set of codes
match exactly: `F10` with `includes_children = 1` is the same row as `F10*`
(`comparePatternKey`).

"Confirmed" in the design wiki means the first two. The other states are shown separately and
labeled, so a "like" match never looks like an exact match.

### Like codes

There is no official crosswalk from ICD-10 diagnoses to CPT/HCPCS services. v1 uses
`condition_groups`, a small hand-curated list (cancer, ESRD/dialysis, transplant, SMI,
SUD, HIV, ...) that admins edit. ICD-10-CM members are prefixes (e.g. `C00`–`D49`); CPT/HCPCS
members are code ranges (e.g. chemotherapy administration `96401`–`96549`). Seed groups also come
from the state categories themselves (LA "Cancer" spans diagnosis, service and pharmacy codes).

Built in M6 step 4:
- **Members** are typed as text per code system and read by `parseCodeCell` (`C00-C96`,
  `F20.*`, `Z99.2`, `96401-96549`). A member covers its codes **and every code under them**,
  whatever its match kind (`conditionMemberSpan` in `packages/shared/src/condition-groups.ts`).
- **Like match:** for code X, the published groups with a member in X's system that covers X.
  A state whose status is `not_listed` or `narrower` gets, per group, its entries in **another**
  code system that share at least one code with a member (`entryInConditionMember`; a wildcard or
  range entry counts when it overlaps). Same-system entries never count.
- **Not a status.** Like codes are a list beside the status (`likeCodes`), not a sixth status: a
  state keeps its real status ("Not listed", "Narrower codes listed") and appears again in its own
  "Like codes" section below the others, so a like match never reads as a match.
- **Draft until published.** Only published groups are used. Migration 0014 seeds eight groups
  as drafts (an AI first draft; CPT as code numbers only, HCPCS and ICD-10-CM checked against
  `ref_codes`).

## Qualification (does a code count on its own?)

States differ on whether a listed code is enough by itself. Each entry records:

| `qualification` | Meaning | Examples |
| --- | --- | --- |
| `standalone` | The code by itself meets the state's criteria (public: "Enough by itself") | MT both tiers; GA Attachment A; LA designation 0 (inferred) |
| `needs_support` | Counts only together with another code or documentation (public: "Needs another code or documentation") | GA Attachment B; LA designation 1 (inferred) |
| `supporting_only` | Evidence that supports another code; never enough alone (public: "Supporting only") | LA designation 2 (inferred) |
| `unknown` | The state does not say (public: "State doesn't say") | NE ("might have to meet other criteria") |

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
6. **Draft cleanup** (weekly maintenance, `apps/api/src/maintenance/maintenance.ts`; built in
   M7 step 2). "Activity" is `coalesce(updated_at, created_at)`: `updated_at` (migration 0015,
   backfilled from the audit log) moves when a source is added, rows are sent, the checks run
   or the draft is discarded.
   - An **open draft** with no activity for 30 days is deleted: its row, entries, parts and
     `version_sources`. A source document it cited goes too (row, then R2 object) only when no
     other version cites it (one `DELETE … WHERE NOT EXISTS` statement; audit `source.expire`).
   - A **discarded** draft older than 30 days loses its entries and parts; its row (with
     `row_count`) and `version_sources` stay as the record, so its sources stay.
   - Published and superseded versions are never selected, and every delete repeats the
     status check, so a draft published meanwhile is left alone.
   - One audit row per draft (`draft.expire`: state, version number, entry count, `deleted` or
     `emptied`). At most 20 drafts per run (about 8 queries each, so the whole run stays far
     under D1's 1,000 queries per invocation on Workers Paid); the rest wait a week (`left` in
     the result).

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
- **AHRQ CCSR** states no licence. The file is downloaded at build time and never committed;
  fixtures are synthetic; pages that show CCSR categories cite AHRQ (packages/reference-data
  README, "CCSR licence and citation"). On the legal team's list.
- **CPT** descriptors are © American Medical Association. We do **not** keep a CPT reference
  table. We show `description_published` exactly as the state printed it, always with a link to
  the state's source document, and the footer carries the AMA CPT notice. The project lead should get
  this approach checked before launch (`docs/legal-review.md`, item 6).
