# Status

_Last updated: 2026-11-03 (M7 complete)_

## Where things stand

- **Phase:** M0 scaffolding. **Step 1 done** (branch `m0-step1-workspace`): pnpm workspace
  with `apps/web`, `apps/api`, `packages/shared` (one placeholder `src/index.ts` each), strict
  TypeScript base config, type-aware ESLint flat config, Prettier, `.editorconfig`, `.nvmrc`
  (26). `pnpm lint`, `pnpm typecheck` and `pnpm format:check` pass. `pnpm check` arrives in
  step 4.
- **Step 2 done** (branch `m0-step2-web`): `apps/web` is a Vite 8 + Vue 3.5 + Vue Router 5
  (file-based routes) + Tailwind 4.3 + TanStack Query 5 app with a placeholder home page and a
  404 page. Design tokens (light and dark) are in `apps/web/src/styles/main.css`; see
  `docs/architecture.md`, "Design tokens".
- **Step 3 done** (branch `m0-step3-api`): `apps/api` is a Hono Worker that serves
  `apps/web/dist` (SPA fallback), `GET /api/public/health`, JSON 404 for unknown `/api/*`, and
  the security headers on every response (strict CSP, no `'unsafe-inline'`). `pnpm dev` runs
  it on http://localhost:8787; `pnpm build` adds a `wrangler deploy --dry-run`. Workers Logs and
  Traces are on.
- **Step 4 done** (branch `m0-step4-tests`): test harness. `pnpm check` (format, lint, types,
  unit, component, api; one line each, logs in `.logs/latest/`) and `pnpm check:full` (+ build,
  e2e with axe in light and dark). 16 Vitest tests + 5 Playwright tests. Public API routes now
  return 405 for non-GET. The header has a System/Light/Dark theme menu (icons, dropdown).
- **Step 5 done** (branch `m0-step5-auth`): Access JWT verification (`jose`), the site gate
  (private by default, fails closed), admin checks on `/admin*` and `/api/admin*`,
  `GET /api/admin/whoami`, a two-mode `robots.txt`, and the localhost-only dev bypass. 39 API
  tests, including every required auth test in `docs/testing.md` that applies so far.
- **Step 6 done** (PR #6): GitHub Actions CI (`check`, `audit`, `gitleaks`; about 1.5 min),
  Dependabot (3-day cooldown), CodeQL default setup (JS/TS + Actions), private vulnerability
  reporting, data-error issue template, `SECURITY.md`, `CONTRIBUTING.md`, README setup steps.
  `main` is protected by a ruleset with **no bypass**: every change goes through a PR with
  green checks; a direct push is refused (tested).
- **Step 7 done** (PRs #8–#10): dedicated Cloudflare account; D1 (`frailty-preview`,
  `frailty-prod`), R2 (`frailty-preview-files`, `frailty-prod-files`) and an Access
  application per host (Google, 24 h, Service Auth for CI). CI deploys preview on `main` and
  production on `v*` tags after approval, with a smoke test (`.github/workflows/deploy.yml`).
  `pnpm cf` runs wrangler with this repo's own token and refuses production deploys.
  **`v0.0.1` is live** on both Workers, behind Access. Remaining: `ADMIN_EMAILS` on both
  Workers and a browser check by the project lead.
- **Step 8 done** (branch `m0-step8-builder`): `.claude/agents/builder.md`, an optional
  builder agent with the standing rules (model `inherit`; the main session may pass a cheaper
  model for pure rote coding). A proof run on Haiku repeated its rules correctly. The "add a
  state source" skill moved to M2 step 12. **M0 is complete.**
- **M1 step 1 done** (branch `m1-step1-schema`): Drizzle schema for every table
  (`apps/api/src/db/schema.ts`), migrations `0000_init` (generated) and `0001_entries_fts`
  (hand-written FTS5 + triggers), enums shared from `packages/shared/src/enums.ts` as CHECK
  constraints, `pnpm db:generate`, `pnpm db:migrate:local`, and a `db-drift` stage in
  `pnpm check`. Pre-deploy backups use D1 Time Travel, because D1 cannot export a database with
  an FTS5 table (`docs/deployment.md`).
- **M1 step 2 done** (branch `m1-step2-codes`): `packages/shared/src/codes.ts` (split, normalize,
  wildcards, ranges, code-system inference, display, code URLs, `entryCovers`) with 103
  table-driven tests from the real files. New code system `drug_class` (LA pharmacy).
- **M1 step 3 done** (branch `m1-step3-reference-data`): `packages/reference-data` builds
  `ref_codes` from pinned CMS files (ICD-10-CM FY2027: 98,403 codes; HCPCS October 2026: 8,770)
  into 22 resumable SQL chunks. `pnpm db:ref:local` loads them locally in ~20 s (77 s on a fresh clone, 2026-11-03). Remote loads
  take two days per database on the free tier (with M1 step 6).
- **M1 step 4 done** (branch `m1-step4-categories`): `packages/shared/src/categories.ts` with the
  five statutory categories (wording verified against the enrolled law), our two, and the
  auto-mapping keyword table, tested on every LA and MT category.
- **M1 step 5 done** (branch `m1-step5-checks`): `packages/shared/src/checks.ts`, every check in
  `docs/ingestion.md` plus the diff and the publish confirmation gate (21 tests).
- **M1 step 6 done** (branch `m1-step6-deploy-migrations`): the deploy records a D1 Time Travel
  bookmark, then applies migrations; a manual **Reference data** workflow loads `ref_codes` in
  chunks (production after approval). First CI migration ran on preview (2026-11-01); preview
  has all 107,173 reference rows (two runs; the second on Workers Paid). **M1 is complete and
  reviewed.** `v0.1.0` is in production (2026-11-01): schema and FTS applied by CI, and the
  production reference load finished the same day (run 41387560691, 22 chunks, all 107,173
  rows).
- **M2 step 1 done** (branch `m2-step1-admin-shell`): `/admin` layout (section nav, "Signed in
  as" from `whoami`, Access sign-out link, a clear message on 401/403), an overview page, and
  `/admin/audit` (newest first, "Load older" paging). API: `GET /api/admin/audit?limit=&before=`
  and `auditInsert()` (`apps/api/src/db/audit.ts`), which returns an unrun insert so later
  steps can put the audit row in the same `db.batch()` as publish and rollback.
- **M2 step 2 done** (branch `m2-step2-watch-dates`): `/admin/watch` (Open grouped as Overdue /
  Due within 14 days / Later / No date yet; History tab; add, edit, close with a required
  note; repeating items), a due-soon banner on every admin page, and
  `GET, POST /api/admin/watch`, `PUT /api/admin/watch/:id`. Migration `0002_seed_watch_items`
  copies the table below into `watch_items`; preview and production get it with the next
  deploy. The state picker waits for loaded states (step 8); the API already takes `stateId`.
- **M2 step 3 done** (branch `m2-step3-source-upload`): `/admin/sources` (pick a state and a
  file; the browser hashes it and warns "already loaded on <date> as version N" before
  sending; list with downloads). API: `GET /api/admin/states`, `GET, POST /api/admin/sources`,
  `GET /api/admin/sources/:id/file`. Migration `0003_seed_states` adds the 50 states and DC
  (status `none`).
- **M2 step 4 done, except xlsx** (branch `m2-step4-parsers`): `/admin/ingest` reads a CSV,
  JSON or tab-separated file, or a pasted table, in a Web Worker; guesses each column's role;
  sets the qualification rule (one value, or per qualification/tier value; published or
  inferred); previews mapped rows; saves a column profile per state and header layout
  (migration `0004_column_profiles`). Qualification labels live in
  `packages/shared/src/qualification.ts`. Excel (.xlsx) through `read-excel-file`, each sheet a table (project lead's choice).
- **M2 step 5 done** (branch `m2-step5-pdf`): `/admin/ingest` reads PDFs. pdf.js
  (`pdfjs-dist` 6.4.299, legacy build) runs in a worker started from the parser worker;
  `pdf-layout.ts` rebuilds rows (column edges from the data, header found above the first code,
  per-gap row splits for wrapped text; see `docs/ingestion.md`, "PDF adapter"). The admin can
  force the wrap direction ("Wrapped lines"). Reads all four seed states' full PDFs; fixtures
  are text-run snapshots of 25 real pages. New `admin` e2e project (local Worker on :8789 with
  the dev bypass). Open: GA-B page 60 has a row with no code (`docs/sources.md`).
- **M2 step 6 done** (branch `m2-step6-review`): review table on `/admin/ingest`
  (`ReviewTable.vue`, `packages/shared/src/review.ts`): each row is Ready, Needs a decision,
  Cannot be read or Dropped; inline edit, drop/restore, per-flag answers (whole category or
  this code only; ICD-10-CM or HCPCS; accept), filters, search, paging (50), and bulk actions on
  the rows shown. Every exact ICD-10-CM/HCPCS code is looked up in `ref_codes`
  (`POST /api/admin/ref-codes/lookup`): settles NE's "ICD-10-CM or HCPCS?" and shows codes CMS
  does not list. Also fixed `pnpm db:ref:local`, which refused every local load since M1 step 6.
- **M2 step 7 done** (branch `m2-step7-drafts`): reviewed rows go to a draft version
  ("Send to a draft" on `/admin/ingest`; `/admin/drafts` and `/admin/drafts/:id` with the parts,
  checks by level, diff per code system, change list, CSV download, discard). Drafts API
  (`/api/admin/drafts*`) re-parses every entry on the server, stores rows per **part** (table
  or sheet; migration `0005_draft_parts`: table `draft_parts`, column `entries.source_part`),
  runs the checks against D1 and stores the report with a token for step 8. New block check:
  incomplete upload. Column roles `Included (Yes/No)` and `Notes / rationale` (GA). The PDF
  adapter keeps its title text for the state-name check. Real files: NE (both tables, 8,183
  entries) sends in ~1.4 s and checks in ~0.2 s locally.
- **M2 step 8 done** (branch `m2-step8-publish`): publish from the draft page (a tick per
  confirmation, the state code typed for the strongest checks; the server re-runs the checks
  and refuses rows that changed), R2 backup of the replaced version, one-batch publish limited
  to the state, `data_version` bump; `/admin/versions` with Restore (rollback). The three
  required tests in `docs/testing.md` (per-state isolation, typed confirmation, exact
  rollback) are in `apps/api/src/routes/admin/publish.test.ts`. Not built yet: pruning backups
  to 20 per state, deleting drafts older than 30 days.
- **M2 step 9 done** (branch `m2-step9-categories`): `/admin/categories` (confirm each
  category's federal category, or all guesses at once; ICD-10-CM chapter overrides for
  chapter-grouped states). Publish stores keyword guesses as `auto`. Migration
  `0006_chapter_mappings`. Since M5 step 5b the one rule is `federalCategoriesOf()` (federal
  parents of the entry's unified categories; this M2 mapping is the fallback).
- **M2 step 10 done** (branch `m2-step10-ai-cleanup`): "Get help from an AI assistant" on
  `/admin/ingest` (prompt per 40-page part, paste the JSON back, validated and reviewed like any
  table) and the optional "Ask Claude" button (`/api/admin/ai-cleanup`, `@anthropic-ai/sdk`
  1.3.0, model from `AI_MODEL`, default `claude-opus-5-5`, refusal fallback on, 30 calls an
  hour). **Off until the project lead sets `ANTHROPIC_API_KEY`** (cost estimate in
  `docs/deployment.md`: about $5–6 for Nebraska's whole file on Opus 5.5). The real API call is
  untested; tests use a fake.
- **M2 step 11 done on preview too** (2026-11-02, driven in the project lead's signed-in
  browser): the same four states published on preview with identical counts; the wrong file
  (NE's PDF as MT) asked for "MT" twice, the button stayed disabled with "NE" typed, and the API
  itself answered 400 (`missing: state_mismatch, large_change`); discarded, MT still v1. Writes
  per entry measured: 4.3 (`docs/deployment.md`).
- **M2 step 11, local half done** (branch `m2-step11-seed-run`, 2026-11-02): all four seed
  states loaded, reviewed, sent, checked and published through the UI on `pnpm dev` with the
  real reference codes, in 38 s of browser time: GA 6,046 codes (A and B in one draft, tier per
  file; new "Tier for every row" field), LA 2,423 (85 drug classes), MT 309, NE 8,182 (two
  tables). Re-loading Montana with Nebraska's PDF asked for the state code typed twice (file
  names NE; 44% of codes gone) and could not be published with "NE" typed. Preview: see above.
- **Assumptions in that run, for the project lead:** bare 3-character codes read as whole
  categories; GA A = qualifies alone, GA B = needs another code (both "the state says so"); MT
  Tier 1 = qualifies alone, Tier 2 = state doesn't say; NE = state doesn't say; LA designation
  0/1/2 as in `docs/sources.md` (inferred). No category mapping is confirmed yet (GA and NE have
  only "(no category)"; LA has 12 categories the keywords do not map).
- **M2 step 12 done, except where the skill file lives** (branch `m2-step12-state-guide`):
  `docs/add-state-source.md`, the step-by-step guide written from the step 11 run (also linked
  from `CLAUDE.md` and the playbook's task table). The project lead decides where the skill
  wrapper goes (`.claude/skills/` is untracked); it only needs to point at that doc.
- **M2 is complete.** Hard stop for the project lead's
  review (PRs #20–#33). See the M2 devlog entry for the summary and the questions.
- **M3 started** (project lead, 2026-11-02 13:25). **Step 1 done** (branch
  `m3-step1-public-states`): `GET /api/public/states` (every state; counts of the published
  version by code system, federal category and qualification; source date; whether every
  mapping is confirmed) behind `publicCache` (Cache API keyed on `data_version`; private mode
  never stores). The Cache API only works on a custom domain, not `*.workers.dev`.
- **M3 step 2 done** (branch `m3-step2-state-map`): the home page map (`StateMap`, shapes
  precomputed from us-atlas at build time into `@mfcd/shared/us-map`), the state card on hover
  or focus, and a Map/Table switch (table first on small screens). Announced states are hatched.
- **M3 step 3 done** (branch `m3-step3-state-page`): `/states/:slug` (summary, counts, the
  state's categories and their federal mapping, sources, version history, notes) and
  `GET /api/public/states/:slug`. Counting shared in `apps/api/src/db/public-summary.ts`.
- **M3 step 4 done** (branch `m3-step4-seo`): the Worker renders `/` and `/states/:slug` as real
  HTML (title, description, canonical, Open Graph, JSON-LD `WebSite` / `Dataset`, the facts in
  plain sentences and tables); CSV and JSON downloads at `/states/<st>/codes.csv|json`;
  `/sitemap.xml`. Public cache keys now include the Worker version (`CF_VERSION_METADATA`).
  The public e2e D1 gets a small Montana list (`apps/web/e2e/fixtures/public-seed.sql`).
- **M3 is complete** (PRs #37–#40, 2026-11-02). Hard stop for the project lead's review; see
  the M3 devlog entry for the summary and the questions (release, two legal items).
- **M4 started** (project lead, 2026-11-02 14:57). **Step 1 done** (branch
  `m4-step1-compare-api`): `GET /api/public/compare` (`buildCompare()` in
  `packages/shared/src/compare.ts`; loader `apps/api/src/db/public-compare.ts`). Rows: one
  category's codes, wildcards and ranges; cells: listed / covered / narrower / not listed / no
  list; 100 rows a page. **CPU on the Free plan (10 ms) is not yet measured**: the worst case
  (all four seed states, every unclassified entry) spent ~20 ms of JavaScript in Node. Read it on
  preview before 2026-11-30.
- **M4 step 2 done** (branch `m4-step2-compare-page`): `/compare` (federal or a state's own
  category, code system, states, "qualifies alone"; the URL holds the selection; 100 rows a
  page; legend), "Compare" in the header and on each state category row, server-rendered
  `noindex` HTML and `/compare.csv` (every row).
- **M4 is complete** (PRs #42–#44, 2026-11-02) and reviewed: wording joins the legal list,
  CPU is acceptable for now, `v0.4.0` tagged for production.
- **Main navigation** (project lead's request, 2026-11-02): a nav bar in the header (Home,
  States, Compare; a menu button on phones; the list is `siteNav` in shared, also in the
  server-rendered HTML) and a new `/states` page. Search and About join the list in M6 and M8.
- **M5 started** (project lead, 2026-11-02). **Step 1 done** (branch `m5-step1-unified`):
  migration `0007_unified_categories` and `unifiedOf()` in `packages/shared/src/unified.ts`
  (spec: `docs/data-model.md`, "Unified categories (M5)"). No routes or UI yet.
- **M5 step 2 done** (branch `m5-step2-ccsr`): AHRQ CCSR v2026.1 in `ref_ccsr` /
  `ref_ccsr_categories` (migration 0008; downloaded and pinned, never committed); longest-prefix
  lookup in `@mfcd/shared/ccsr`. 16 invalid codes in the seed lists noted in `docs/sources.md`.
- **M5 step 3 done** (branch `m5-step3-admin-unified`): `/admin/unified` and `/admin/mappings`
  with their APIs; mappings superseded, never deleted; one admin may approve. Open: should a
  never-published draft be retirable (refused now)?
- **M5 step 4 done** (branch `m5-step4-coverage`): placements (`entry_unified`), universes,
  `GET /api/public/overview` (SQL aggregates). A remap of a large state costs ~8k D1 writes; a new
  reference release does not rebuild placements yet.
- **M5 step 5 done** (branch `m5-step5-overview`): the overview matrix at `/compare`
  (server-rendered, indexed); the M4 table moved to `/compare/codes`.
- **M5 step 5b done** (branch `m5-step5b-followups`): federal categories through unified
  categories (downloads renamed to `federal_categories`), draft retire, sources chunking, overview
  order in the URL.
- **M5 step 6 done** (branch `m5-step6-drilldown`): `/compare/<slug>` drill-down with "Include
  codes no state lists", details, CSV; counts in SQL.
- **M5 step 7 done** (branch `m5-step7-diff`): `/compare/states/<a>-vs-<b>` (2–4 states, noindex),
  similar states on state pages, `state_similarity` (migration 0010). A rule a state doesn't
  state counts as no disagreement (to confirm at the M5 review).
- **M5 step 8 done** (branch `m5-step8-tilemap`): the tile map on the home page.
- **M5 is complete** (PRs #47–#56, 2026-11-02). Hard stop for the project lead's review; see
  the M5 milestone devlog for the questions (starter categories, two rules, a dark shade, release).
- **M5 review** (project lead, 2026-11-02): 19 starter unified categories seeded as drafts
  (migration 0011); the two rules stay as built and go to the legal list; the "no list" shade is a
  neutral grey in both themes; `v0.5.0` approved.
- **Preview data** (project lead, 2026-11-02): production holds the real lists and admins edit
  them there. Preview becomes a test site with seed data and a banner. **Step 1 done** (branch
  `prod-state-copy`): the **Copy state data** workflow copies preview's four states to an empty
  production, after the production approval. Steps 2–4 are next: rebuild coverage, seed, banner.
- **Preview data, step 2 done** (branch `coverage-rebuild`): **Rebuild coverage** on Admin →
  Unified categories (`POST /api/admin/coverage/rebuild`) rebuilds full code lists, placements and
  similarity from the base rows. For seed data loaded as SQL and for a new CCSR or ICD-10-CM release.
- **Preview data, step 3 done** (branch `preview-seed`): `pnpm db:seed:make` writes
  `apps/api/seed/seed.sql` (120 real entries per state, starter categories published, identities
  scrubbed). `pnpm db:seed:local` and `pnpm db:seed:preview` replace that database's state data;
  then press Rebuild coverage. Never production.
- **Preview data, step 4 done** (branch `env-banner`): every HTML page of a Worker whose
  `ENVIRONMENT` is not exactly `production` opens with a gold "Preview site: test data" banner
  (`src/middleware/environment-banner.ts`). It is added at run time, so both Workers run the same build.
- **Preview data done** (2026-11-02, 23:08 CST):
  - **Production has the real lists.** The project lead approved Copy state data, run
    41579169608. Production matches preview on row counts, checksums and the four published
    states, and its five R2 files pass SHA-256. Bookmark before the copy:
    `00000009-00000000-00005118-c5f815f77b9a6cbc5768eed2dfbc9729`.
  - **Preview has the seed.** It holds 480 entries and all 19 categories are published.
    Bookmark before the seed: `00000046-00000000-00005118-ab565850df3a1d1238999baf26ba4ddb`.
  - **Next, for the project lead:** press Rebuild coverage on preview.
  - **On production,** the 19 starter categories are still drafts. Edit them and publish them
    there.
- **Compare tabs** (project lead, 2026-11-02): every `/compare` page has the tabs Overview,
  Categories (`/compare/categories`, new), Map (`/compare/map`, new; the only place for the tile map since 2026-11-03, when the project lead moved it off home; old `/?category=` links get a 301 there), States side
  by side (`/compare/states`, new, with "States like mine") and Single codes. Matrix column
  labels link to their category. `categories` and `map` are reserved slugs.
- **M6 step 1 done** (branch `m6-step1-search`): `GET /api/public/codes/search` (code prefix or words; state and system filters; `listedBy`), `ref_codes_fts` over the CMS text (migration 0012, backfilled in the migration), query schema in `packages/shared/src/search.ts`.
- **M6 step 3 done** (branch `m6-step3-code-detail`): `/codes/<system>/<code>` (SPA) and `GET /api/public/codes/:system/:code`: every state grouped by status, "Confirmed" (listed, covered) first, each group with one sentence of help; listed states show the entry as published, the state's text, category, tier, rule and source. Matching reuses the drill-down SQL. The API reads `app_meta.show_qualification` (first route to do so). Drill-down codes link to their page.
- **M6 step 3b done** (branch `m6-step3b-plain-language`): plain-language pass on every public
  page, for a state Medicaid reader. Public names (glossary in `docs/data-model.md`): a state's
  list **includes** a code (listed or covered), never "covers what"; **comparison categories**
  (never "unified"); the badges are **the state's rule** ("Enough by itself", never
  "Qualifies"); every count says what it counts (billable ICD-10-CM only for the share; "n of
  N" out of states with a list; entries vs expanded codes in the state comparison). New: a
  footer with a disclaimer and the law, the law's clause text on the Categories tab and each
  category page, a legend under every code table, AHRQ's CCSR link. Wording moved into
  `packages/shared` (Vue and the Worker's HTML share it; the HTML now has the footer too).
  Migration `0013_reword_unified_drafts` rewords 0011's starter categories field by field, only
  where the text is still 0011's, so admin edits are kept.
  - **"Learn more" places waiting for the About/methodology page (M8 step 4):** home intro
    ("How this site counts"); footer (About and methodology, Report a problem); the overview's
    "Reading this table" (share, Overall, †, not yet reviewed); the Categories tab intro and each
    category page (how the categories were built, the AI first draft, why dementia sits under
    (cc) and chromosomal conditions under (dd)); the state page's categories intro (how mapping
    and review work); the similarity note (how it is computed); the downloads (a column guide,
    `description_source`); the badges and "inferred" (each state's rule, or `/states/<slug>#sources`);
    a state page with no list ("report a list"); the court ruling note.
- **M6 step 4 done** (branch `m6-step4-condition-groups`): condition groups for "like" codes. Migration 0014 rebuilds `condition_groups` (definition, sources, status, updated_by/at) and seeds eight groups as **drafts**; `/admin/condition-groups` (list, create, edit, members as text read by `parseCodeCell`; audit row and `data_version` in one batch); the code detail API adds `conditionGroups` and per-state `likeCodes` (published groups only), shown in a "Like codes" section after the others. **For the project lead:** check the groups and publish them; nothing shows publicly until then.
- **M6 step 5 done** (branch `m6-step5-code-pages-ssr`): `/codes/<system>/<code>` server-rendered from `publicCode` (title "F20.0 … : medical frailty status in N states", a Summary with one plain sentence per state with a list, sources and dates, like codes, "Last updated"), JSON-LD `WebPage` + `DefinedTerm`; other spellings answer 301 (the Vue page replaces the URL too); unknown codes a 404 with `noindex`; **indexed only when a published state includes the code**. `/sitemap.xml` is now a sitemap index (`/sitemaps/pages.xml`, `/sitemaps/codes-<n>.xml`, 50,000 URLs each; 8,004 codes on the seed). `/search` is served with `noindex` and `X-Robots-Tag`; every `noindex` page sends the header. HTML code tables link single codes to their pages.
- **51-state seed** on preview (PR #66): 4 real states (300 entries each), 40 synthetic lists,
  4 announced, 3 none.
- **M6 step 3c done** (branch `m6-step3c-contributor-docs`): new `docs/getting-started.md`
  (non-technical setup, WSL, fork, local site; run from a fresh clone) and a rewritten
  `docs/playbook.md`; README, CONTRIBUTING and `.gitattributes` (LF) aligned. Steps with
  GitHub, Claude Code sign-in and Windows were not run.
- **M6 step 2 done** (branch `m6-step2-search-page`): `/search` (SPA, `noindex` meta added by the page): one search box, code system and state filters, results as you type (250 ms pause, 2+ characters, one TanStack query key per search), the URL holds `q`, `states`, `system`; each result links to its code page, names the state whose text it shows and says "Listed by n of N states with a list on this site"; a polite live region announces the count. Search joins `siteNav`. Wording in `packages/shared/src/search-page.ts`.
- **Fix: the home map no longer moves on hover** (branch `fix-map-hover-shift`, 2026-11-03): every state's card is stacked in one grid cell as an invisible, `aria-hidden`, `inert` sizer, so the card cell keeps one height and the map cannot shift or "bounce"; a placeholder (`MAP_CARD_PLACEHOLDER`) shows when no state is active. Spec: `e2e/home-map-shift.spec.ts`.
- **M6 is complete** (PRs #69–#76, 2026-11-03, 10:31–12:40 CST). Hard stop for the project
  lead's review. Built: the search API (all ICD-10-CM and HCPCS descriptions, porter
  stemming, migration 0012), `/search`, code pages `/codes/<system>/<code>` (server-rendered,
  `DefinedTerm`, indexed only when a state includes the code, a sitemap index), 8 draft
  condition groups and like codes (0014), the plain-language pass (0013), contributor docs, and
  the home map hover fix. **For the review:**
  - **`v0.7.0` is live** (the project lead tagged and approved it; CI run 41698090729,
    2026-11-03). 0012–0014 applied on production, and the search index took 0.9 s. Bookmark
    before the migrations: `00000012-00000000-00005118-b846c9731914f1f1a56dc2eefef1c849`.
    Checked on production: search, a code page (title, plain sentences, JSON-LD, 301 from
    `f200`), a CMS-only code page that is `noindex`, the sitemap index, `X-Robots-Tag` on
    `/search`, the footer, and the home map holding still on hover.
  - The 8 condition groups are drafts. Their CPT ranges are numbers only and unchecked;
    check them before publishing.
  - The 19 starter categories are still drafts on production. 0013 rewords any that are
    unedited.
  - Lawyers (the project lead, 2026-11-03: the legal list covers it): should the badge say "Enough by itself (state's rule)" everywhere? Today the
    column heading says "State's rule". The legal list has every new and reworded string.
  - Cost to watch: one sitemap request reads ~44k D1 rows. There is no edge cache on
    `workers.dev`.
  - `entries_fts` (state text) has no stemming, unlike `ref_codes_fts`. The project lead
    (2026-11-03) said leave it, and it went to the legal list.
- **M7 step 3 done** (branch `m7-step3-remap`): bulk remap on `/admin/categories`: tick rows
  (or "Select all … of <state>"), choose one federal category or chapter override, check the
  server's preview (`POST …/categories/preview`: entries that move, that stay because a
  unified placement or chapter override wins, a 20-entry sample, per-federal-category totals
  before → after, draft entries), then save (`POST …/categories/remap`, the preview's token;
  409 if anything changed). One batch: n mappings + audit + `content_updated_at` +
  `data_version`; nothing is recomputed. Logic in `packages/shared/src/remap.ts`. Every
  change, one row's or one chapter's too, goes through the preview; only a "Confirm" that moves
  no published entry (stored mapping unchanged, or a draft-only category) saves at once. `PUT …/chapters/:chapter` was removed.
- **M7 step 1 done** (branch `m7-step1-backup`): `/admin/restore` ("Backup and restore").
  **Download:** `GET /api/admin/backup` streams a zip with one JSON file (format 2: every
  state-data table, page by page, no reference, derived or FTS tables, no R2 keys); seed: 5.4 MB
  JSON, 237 kB zip, ~0.3 s. **Restore path 2:** the browser reads a full `.zip` or a per-publish
  `.json` (format 1), the admin picks one state and version, and it becomes a new draft through
  the draft API (sources reused by SHA-256 or stored without the file; mappings only when
  ticked, after a diff). No schema change. The e2e test of restore path 2 passes (run twice, at the merge).
- **M7 step 2 done** (branch `m7-step2-cron`): weekly maintenance. A Cron Trigger
  (`0 7 * * SUN`, both Workers) and `POST /api/admin/maintenance` ("Run maintenance now" on
  `/admin/restore`) run the same four parts, each in its own try/catch: weekly dump to
  `backups/weekly/<date>.zip` (the download's zip plus R2 keys; buffered, 32 MB cap) → keep 12 →
  keep 20 per-publish backups per state → draft cleanup (open drafts idle 30 days deleted with
  sources nobody else cites; discarded ones emptied, row kept). Result in
  `app_meta.last_maintenance`, shown on the page with the weekly dumps and their downloads.
  Migration `0015_draft_updated_at` adds `dataset_versions.updated_at` (nullable, backfilled).
  The dump costs 65–160 ms CPU on the seed: **it needs Workers Paid** (Free allows 10 ms per
  Cron Trigger; `docs/deployment.md`, "Weekly maintenance").
- **M7 is complete** (PRs #80–#82, 2026-11-03, 13:34–14:55 CST). Hard stop for the project
  lead's review. Built: bulk remap with a preview (`/admin/categories`), backup download as a
  zip and restore path 2 (`/admin/restore`), and a weekly cron: dump, prunes, draft cleanup
  (migration 0015). **For the review:**
  - Tag `v0.8.0`? It applies 0015 on production and turns on the Sunday cron there.
  - Try "Run maintenance now" on preview (Backup and restore page). It writes a weekly dump
    to R2 and deletes only drafts idle for 30 days or more; preview has none that old.
  - **The weekly dump needs Workers Paid** (65–160 ms of CPU; a Free cron gets 10 ms). On a
    downgrade, drop the dump from the cron or move it to a Workflow (`docs/deployment.md`).
  - Backup decisions taken by the lead (main session): the download leaves out R2 keys and the
    weekly dump keeps them; 50 MB import cap; a restored mapping keeps its original mapper,
    and the audit row names who restored it.
- **Toolchain:** Node 26 LTS, pnpm 12.16.1 (installed by hand), TypeScript 6.0.3 (not 7; see
  `docs/architecture.md`, "Tool versions"). pnpm refuses packages younger than 3 days.
- **Skill folders** (`.agents/`, `.claude/skills/`, `skills-lock.json`) stay untracked on
  purpose (user, 2026-11-01). Their sources are in `docs/architecture.md`, "Agent skills".

## Decisions made (2026-11-01, with the user)

| Topic | Decision |
| --- | --- |
| Hosting | Cloudflare: one Worker serves the Vue build (static assets) and the API; D1 for data; R2 for source files and backups |
| Parsing | In the admin's browser (pdf.js, read-excel-file). The server receives validated JSON rows only |
| AI cleanup | Both: a copy-paste prompt (free, always available) and an optional Claude API button that appears only when an API key secret is set |
| Admin auth | Cloudflare Access with Google login, plus JWT verification in the Worker |
| Pre-launch | The **whole site** is behind Access until the user marks it live. After launch, only `/admin*` and `/api/admin*` stay protected |
| CPT text | Show the state's published description with a citation, and an AMA notice in the footer. No CPT descriptor table of our own |
| Repo | Public on GitHub (free Actions minutes, CodeQL) |
| Domain | None yet. Use `*.workers.dev` until a domain is bought (~$10/yr via Cloudflare Registrar) |
| Seed states | Georgia (Attachments A and B), Louisiana, Montana, Nebraska |
| Name | **Medical Frailty Coding Dashboard** |
| Licence | MIT (already in `LICENSE`) |
| Admins | Two Google accounts (the user and one other). The emails live only in the Access policy and the `ADMIN_EMAILS` Worker secret, **never in the public repo** |
| Georgia A/B | Two tiers, loaded as one version; tier kept in `entries.tier` |
| Tiers and qualification | Show **each state's own rule**: the state's tier label plus a badge (qualifies alone / needs another code / supporting evidence / state doesn't say), with "inferred" shown where we deduced it. Site-wide note on the 2026-10-29 *Massachusetts v. Oz* ruling. Compare and search can filter to "qualifies alone" (user, 2026-11-01, after research showed the ruling does not strike down tiers). **Provisional:** the user works with a team of lawyers who may ask to remove or reword the badges later |
| Look and feel | Colours based on the Georgetown CCF palette; open-licensed fonts (Jost headings, Source Sans 3 body, IBM Plex Mono codes), self-hosted; no serif for now. **Not an official CCF site**: no CCF name or logo; branding may be added later (user, 2026-11-01) |
| Dark mode | Light, dark and "follow system" must all work before launch. Tokens for both themes exist; the switch comes in M0 step 4; axe runs in both themes in M8 (user, 2026-11-01) |
| Static files and the Worker | Until launch every request runs the Worker first (one place for headers; site gate covers assets). At go-live, `/assets/*` moves to direct serving with a `_headers` file (user, 2026-11-01) |
| CSP styles | No `'unsafe-inline'` for `style-src` (user, 2026-11-01) |
| Logs | Workers Logs + Traces on, query strings redacted; free tier (user, 2026-11-01) |
| Theme menu | Dropdown with icons in the header (System / Light / Dark) (user, 2026-11-01) |
| Site gate | Before launch, anyone Access lets in may see the site (admins, guest testers, CI service token); admin routes also need `ADMIN_EMAILS` (user, 2026-11-01) |
| robots.txt | Private: disallow all. Public: allow the site, disallow `/admin` and `/api/`; add a sitemap at launch (user asked for a good one from the start, 2026-11-01) |
| SEO and GEO | Best practices; AI crawlers welcome so AI gets the right information. Worker renders real HTML for public pages. `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. See `docs/seo.md` (user, 2026-11-01). **`ai-train=yes` is provisional:** the legal team may revisit it because pages quote AMA-copyrighted CPT text |
| Domain and hosting | The project lead buys a domain in M8, or gives the site to an organization to host. Keep the site portable (user, 2026-11-01) |
| Branch protection | Ruleset on `main` with no bypass, not even for admins (user, 2026-11-01) |
| D1 backups before production migrations | D1 Time Travel bookmark logged by CI, not `wrangler d1 export` (refuses FTS5 databases) (user, 2026-11-01) |
| IDs and dates | Integer IDs (states keep the 2-letter code); ISO-8601 text dates (user, 2026-11-01) |
| State page URLs | Lowercase postal code, `/states/ga`; the database enforces `slug = lower(id)` (user, 2026-11-01) |
| Code page URLs | Computed from code system + code, e.g. `/codes/icd-10-cm/F20.0`; no slug column (user, 2026-11-01) |
| Workers Paid for one month | $5 once (user, 2026-11-01), so the 107k reference rows load in one go instead of two days per database. Superseded 2026-11-02: the project lead stays on Workers Paid (see "Workers plan") |
| States only | The site covers the 50 states and DC; no territories (project lead, 2026-11-01) |
| Excel reader | `read-excel-file` from npm, not SheetJS from its CDN (project lead, 2026-11-01) |
| Add-a-state guide | Served in the app at `/admin/guide` (rendered from `docs/add-state-source.md`), linked from "Read and map" when a file cannot be read. No separate agent skill (project lead, 2026-11-02) |
| Step 11 assumptions | Whole-category reading of bare codes and the qualification per state look right; the project lead verifies later (2026-11-02) |
| Claude API button | Stays off; shown disabled with a tooltip that says it needs a key and costs money (project lead, 2026-11-02) |
| Release after M2 | `v0.2.0` in production 2026-11-02 (approved by the project lead; run 41492763306): migrations 0002–0006 applied, smoke test passed. No state data in production yet |
| Release after M3 | `v0.3.0` in production 2026-11-02 (run 41523353868); production still has no state lists |
| Release after M4 | `v0.4.0` tagged 2026-11-02 at the project lead's request; production deploy waits for the lead's approval in GitHub |
| Three category levels (M5) | Federal, unified (admin-curated) and state-specific; all five mockup views; M5 before code search (project lead, 2026-11-02; `docs/devlog/2026-11-02-m5-plan.md`) |
| CCSR (M5) | Used from the start; downloaded from AHRQ at load time, pinned by version and SHA-256, never committed (AHRQ states no licence) (project lead + AI, 2026-11-02) |
| Mapping approval (M5) | One admin may approve; public pages say who reviewed it and when (project lead, 2026-11-02) |
| Workers plan | Stay on Workers Paid ($5/month); the 2026-11-30 downgrade is dropped (project lead, 2026-11-02) |
| Federal category (M5) | Pre-mapped through unified categories: a code's federal category follows its unified categories' fixed federal parents (a code in two counts under both); admins manage only state → unified; the M2 federal mapping is the fallback (project lead, 2026-11-02) |
| Retiring drafts | A never-published unified category may be retired (project lead, 2026-11-02) |
| Reference releases | A new CCSR or ICD-10-CM release rebuilds universes and placements (project lead, 2026-11-02) |
| Compare CPU on the Free plan | Moot: staying on Workers Paid (project lead, 2026-11-02) |
| Professional site basics | Added to M8 (favicon and icons, share image, footer links, privacy and accessibility statements, `security.txt`, print styles) (project lead, 2026-11-02) |
| `pnpm dev:stop` | Stops the whole `pnpm dev` tree, parents first (project lead asked, 2026-11-01) |
| Launch criteria | At least **2 states** with every category mapping confirmed by an admin, plus a usability gate: real target users can complete the core tasks (roadmap M8) |

## Open questions


1. **Dates to watch** live in the app at `/admin/watch` (next: ~2026-12-28, the
   *Massachusetts v. Oz* appeal deadline). Close the 2026-11-30 downgrade item there: the
   project lead stays on Workers Paid.
2. **Louisiana "Code Designation" (0/1/2):** likely 0 = qualifies alone, 1 = needs a
   supporting code, 2 = supporting evidence only (SHVS 2026-09-11 + a fit against the data).
   Not confirmed by LDH, so it is shown as "inferred". The "code system" explanation does not
   fit the data. See `docs/sources.md`.
3. **Louisiana .xlsx:** none public (search, 2026-11-01). LDH's work requirements page
   (https://ldh.la.gov/Medicaid/work-requirements) links only PDFs, and none of them is the
   code list; the source URL of our `HR1-Codes` PDF is unknown. Next step if wanted: ask LDH
   or an MCO provider-relations line for the .xlsx and the Code Designation definition.
   Until then, parse the PDF.
4. **Georgia source:** URL and publish date of Attachments A and B.

## Watch dates

**History only (since M2 step 2, 2026-11-01).** The app's `/admin/watch` page is now the
source of truth; migration `0002_seed_watch_items` copied this table into it. Add, edit and
close dates there, not here. Approximate dates are marked ~.

| Date | What | Why it matters | Source |
| --- | --- | --- | --- |
| ~2026-12-28 | *Massachusetts v. Oz*: CMS appeal deadline (60 days from judgment; exact date depends on when judgment was entered) | An appeal or stay may change the site's ruling note; states may loosen combination rules either way | `docs/sources.md`, "Federal and court rulings" |
| 2026-11-30 | Downgrade the Cloudflare account from Workers Paid to Free (Workers & Pages → Plans) | The $5 was for one month only (reference-code load); check usage first so nothing still needs the paid quota | Decisions table |
| ~2026-12 | CMS posts the January 2027 HCPCS file | Build the diff loader first, so the update loads only new and changed codes (`packages/reference-data/README.md`, "Updating") | CMS HCPCS quarterly update page |
| ~2027-06 | CMS posts ICD-10-CM FY2028 files (valid 2027-10-01) | Load the changes into `ref_codes`; re-run checks for every state | CMS ICD-10 page |
| 2027-01-01 | Work requirements take effect | States may publish final or revised lists before this date; re-check all seed states | H.R.1 §71119 |
| ~2027-04-29 | End of the 6-month enforcement stay for the 26 plaintiff states (6 months from 2026-10-29; confirm against the order) | Plaintiff states' frailty processes may change | Opinion, "Relief" |
| No date | *Taylor v. Kennedy* (D. Md. 1:26-cv-03705) pending | A ruling could change the federal rules again | `docs/sources.md` |
| No date | LDH confirms Louisiana "Code Designation" meaning | Remove the "inferred" label, or fix the mapping | `docs/sources.md`, Louisiana |
| No date | Legal team decides the licence of the compiled lists (for the `license` field in the state pages' `Dataset` JSON-LD and the downloads; left out until then) | Search engines recommend a licence on datasets | `docs/seo.md` |
| No date | Legal team reviews qualification badges, federal category labels (`categories.ts`), ruling note, disclaimer, CPT text, LA drug class codes (they look like First Databank's licensed HIC3 classes; we show only the state's own text), `ai-train=yes` in `robots.txt`, and the compare page's cell words and legend ("Listed", "Covered by a broader entry", "Narrower codes listed", "Not listed", "No list on this site"; `compareStatusLabels` in `packages/shared/src/compare.ts`) the overview's and drill-down's public wording ("n of N states", filter names, "Only <state>", "Differs", "Similarity", the tile map's wording, "Which states cover what", legend, notes, "not reviewed"), the starter unified categories (migration 0011: labels, definitions, CCSR choices are the AI's first draft); two rules applied as best guesses pending review: a "State doesn't say" rule is no disagreement in the state comparison, and a chapter override confirms a code with no unified category; plus the compare CSV, which carries each state's published descriptions (CPT text included) in bulk; for M5, the CCSR licence and citation (AHRQ states no terms), the unified category labels and the match words (exact, close, broad, narrow); reworded 2026-11-02 for clarity (project lead): the state comparison's intro ("grouped by the same categories as the overview") and note ("Each code here is one entry from the chosen lists…"), and the overview note ("no matter which of the state's own categories…"); the compare tabs (2026-11-02): tab labels (Overview, Categories, Map, States side by side, Single codes), the Categories, Map and States side by side pages' headings, intros and meta descriptions (`packages/shared/src/compare-tabs.ts`), and "Start from your state", "Your state", "Choose 2 to 4 states", "Show similar states", "Choose states to compare", "Sort by <category>", "Fewer than 2 states have a list on this site yet."; the home page's link to the Map tab (2026-11-03): "See one category across the country on the map" (`TILE_MAP_HOME_LINK`); the code detail page (M6 step 3, `packages/shared/src/code-detail.ts`): the status help sentences, "Confirmed" and "Other states" with their intros, the description notes (CMS text; "CPT descriptions are not shown here…"), the page title and the not-found text; **reworded 2026-11-03, M6 step 3b** (plain-language pass; every item above stays on this list): badges "Enough by itself", "Needs another code or documentation", "Supporting only", "State doesn’t say", their help text ("The state’s list says this code, by itself, meets its medically frail criteria." …) and bases ("Stated by the state", "Inferred by this site from the state’s documents (not stated by the state)"), all in `qualification.ts`; federal labels "State’s own category (not in the law)" and "Not yet classified", and the law’s clause text now shown on the Categories tab and category pages (`federalCategoryClauseText`); "Which states cover what" is now "How much of each category each state lists", with "Overall (average)", the intro, caption, meta description and "Reading this table" notes (`overview.ts`: billable ICD-10-CM only, plain average, “* Not yet reviewed”); "n of N states" with "States that include it", "State rules", "Enough by itself: 3 states (1 inferred)", "2 of 4 include any", the count note, filter names ("Included by every state with a list", "Included by fewer than half", "Included by one state only"), "Also show codes no state includes" and the reference-list note (`drill.ts`); the tile map ("One category, every state", intro, caption, "None", not-reviewed note; `tile-map.ts`); the state comparison: "Only <state> includes", "Both include", "All 3 include", "Similarity (0–1)", the intro (now states the "State doesn’t say" rule), summary and basis notes, similarity note, "Not in any comparison category" (`states-compare.ts`); the compare tabs: "Comparison categories" heading and intro, map and states-side-by-side intros (`compare-tabs.ts`); the single-code page: "Compare single codes", intro, the legend now under every code table with "Not listed" and "No list on this site" added, "As published by <state>", "No description from CMS or the state", "State’s category:", "Download this table (CSV, N rows)" (`compare.ts`); the code page: "Included" / "Not included" (was "Confirmed" / "Other states"), its help, title and not-found text (`code-detail.ts`); the state page: categories intro, "Review status" ("Reviewed" / "Not yet reviewed (automatic suggestion)"), the date labels, the no-list sentences (`public.ts`); the home intro and title (`HOME_INTRO`, "medical frailty code lists"); the JSON download note; the starter categories (migration 0013: SMI definition, "Chronic kidney disease and kidney failure", the transplant and frailty indicators definitions, "Diagnosis groups (CCSR):"); the federal placement of dementia (cc) and chromosomal conditions (dd) is this site’s choice, to say on the methodology page. **New text (2026-11-03, M6 step 3b):** the footer disclaimer on every page (`FOOTER_TEXT`: "…This site is not a state or federal source and does not determine anyone’s eligibility; check the state’s document before relying on a code. No patient data."), the home intro's "It does not decide anyone’s eligibility." and the "Read the law" links; the search page (M6 step 2, `packages/shared/src/search-page.ts`): heading, intro, "Text published by <state>", "Listed by n of N states with a list on this site", the empty, loading and error texts, and the filter labels; like codes (M6 step 4, `packages/shared/src/condition-groups.ts`): the "Like codes" heading, its one-sentence explanation and note ("not an official crosswalk"), the groups sentence, and the eight starter condition groups (migration 0014, drafts: Cancer and chemotherapy, Kidney failure and dialysis, Organ transplant, HIV, Serious mental illness, Substance use disorder, Hemophilia and clotting factor disorders, Multiple sclerosis; names, definitions and members are the AI's first draft, CPT ranges as numbers only and not checked against a CPT file); **new text (M6 step 5, `code-detail.ts`):** the code page title "<code> <CMS text>: medical frailty status in N states" (CPT: "CPT <code>: …"), its meta description, the Summary sentences ("n of N states with a list on this site include <code>.", "<State>’s list includes <code> [through its entry <entry>]. State’s rule: <badge> (inferred by this site).", "<State>’s list does not include <code> [itself, but lists n more specific codes under it].") and "Last updated on this site <day>."; in JSON-LD, a CPT code with no CMS text is named by the first listing state’s own text, with "As published by <state> (<document>)"; the home map's placeholder (2026-11-03): "Point at a state on the map, or tab to it, to see its list." (`MAP_CARD_PLACEHOLDER`, `public.ts`); search matching (M6, project lead 2026-11-03): word search over CMS descriptions uses stemming ("disorders" finds "disorder"), but search over the states' own published text does not, so the same word can find a code through CMS text and miss it in a state's text; left as is for now | Badges may be removed or reworded; AI training signal may change | This file, decisions table; `docs/seo.md` |

## Re-ingestion safety (user requirement, 2026-11-01)

States will reissue their lists. A re-upload must be able to replace a whole state, with
warnings and data checks so a wrong file cannot damage the database. Design: draft versions,
blocking/typed-confirm checks, diff, atomic per-state publish, pre-publish backup, one-click
rollback. See `docs/ingestion.md` ("Checks before publishing") and `docs/data-model.md`
("Replacing a state's list").

## How the user likes to work

- **Within a milestone, keep going** (user, 2026-11-01): show the plan briefly, then build
  without waiting for approval, merge each step's PR when CI is green, and move to the next
  step. Ask questions only when blocked on a product or legal decision. **The hard gate is the
  end of a milestone:** stop there for the project lead's review. Production tags still need
  explicit approval.
- The user works with a team of lawyers. On legal questions (what the ruling means, how
  qualification is described, disclaimers, CPT text) the lawyers decide. Present research and
  a recommendation, label it as not legal advice, and expect changes.

- Keep `CLAUDE.md` small. It points to docs that agents load when they need them.
- The user pays for hosting personally, so keep running costs near $0. Say what anything
  will cost before adding it.
- Ask questions instead of guessing on product decisions.
