# Status

_Last updated: 2026-11-02 (M4 step 2)_

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
  into 22 resumable SQL chunks. `pnpm db:ref:local` loads them locally in ~20 s. Remote loads
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
  `0006_chapter_mappings`. `federalCategoryOf()` in shared is the one rule for admin and public
  pages.
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
  `noindex` HTML and `/compare.csv` (every row). **M4 is complete.**
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
| Dark mode | Light, dark and "follow system" must all work before launch. Tokens for both themes exist; the switch comes in M0 step 4; axe runs in both themes in M7 (user, 2026-11-01) |
| Static files and the Worker | Until launch every request runs the Worker first (one place for headers; site gate covers assets). At go-live, `/assets/*` moves to direct serving with a `_headers` file (user, 2026-11-01) |
| CSP styles | No `'unsafe-inline'` for `style-src` (user, 2026-11-01) |
| Logs | Workers Logs + Traces on, query strings redacted; free tier (user, 2026-11-01) |
| Theme menu | Dropdown with icons in the header (System / Light / Dark) (user, 2026-11-01) |
| Site gate | Before launch, anyone Access lets in may see the site (admins, guest testers, CI service token); admin routes also need `ADMIN_EMAILS` (user, 2026-11-01) |
| robots.txt | Private: disallow all. Public: allow the site, disallow `/admin` and `/api/`; add a sitemap at launch (user asked for a good one from the start, 2026-11-01) |
| SEO and GEO | Best practices; AI crawlers welcome so AI gets the right information. Worker renders real HTML for public pages. `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. See `docs/seo.md` (user, 2026-11-01). **`ai-train=yes` is provisional:** the legal team may revisit it because pages quote AMA-copyrighted CPT text |
| Domain and hosting | The project lead buys a domain in M7, or gives the site to an organization to host. Keep the site portable (user, 2026-11-01) |
| Branch protection | Ruleset on `main` with no bypass, not even for admins (user, 2026-11-01) |
| D1 backups before production migrations | D1 Time Travel bookmark logged by CI, not `wrangler d1 export` (refuses FTS5 databases) (user, 2026-11-01) |
| IDs and dates | Integer IDs (states keep the 2-letter code); ISO-8601 text dates (user, 2026-11-01) |
| State page URLs | Lowercase postal code, `/states/ga`; the database enforces `slug = lower(id)` (user, 2026-11-01) |
| Code page URLs | Computed from code system + code, e.g. `/codes/icd-10-cm/F20.0`; no slug column (user, 2026-11-01) |
| Workers Paid for one month | $5 once (user, 2026-11-01), so the 107k reference rows load in one go instead of two days per database. **Downgrade to Free by 2026-11-30** (watch date). Nothing in the code depends on the paid plan |
| States only | The site covers the 50 states and DC; no territories (project lead, 2026-11-01) |
| Excel reader | `read-excel-file` from npm, not SheetJS from its CDN (project lead, 2026-11-01) |
| Add-a-state guide | Served in the app at `/admin/guide` (rendered from `docs/add-state-source.md`), linked from "Read and map" when a file cannot be read. No separate agent skill (project lead, 2026-11-02) |
| Step 11 assumptions | Whole-category reading of bare codes and the qualification per state look right; the project lead verifies later (2026-11-02) |
| Claude API button | Stays off; shown disabled with a tooltip that says it needs a key and costs money (project lead, 2026-11-02) |
| Release after M2 | `v0.2.0` in production 2026-11-02 (approved by the project lead; run 41492763306): migrations 0002–0006 applied, smoke test passed. No state data in production yet |
| `pnpm dev:stop` | Stops the whole `pnpm dev` tree, parents first (project lead asked, 2026-11-01) |
| Launch criteria | At least **2 states** with every category mapping confirmed by an admin, plus a usability gate: real target users can complete the core tasks (roadmap M7) |

## Open questions


1. **Dates to watch** live in the app at `/admin/watch` (next: 2026-11-30, the Workers Paid
   downgrade; ~2026-12-28, the *Massachusetts v. Oz* appeal deadline).
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
| No date | Legal team reviews qualification badges, federal category labels (`categories.ts`), ruling note, disclaimer, CPT text, LA drug class codes (they look like First Databank's licensed HIC3 classes; we show only the state's own text), and `ai-train=yes` in `robots.txt` | Badges may be removed or reworded; AI training signal may change | This file, decisions table; `docs/seo.md` |

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
