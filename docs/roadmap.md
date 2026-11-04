# Roadmap

Each step is sized for one builder agent: do the step, run `pnpm check`, commit, stop. A
milestone is done when every step's acceptance check passes and `pnpm check:full` is green on
`main`. At the end of each milestone: update `docs/status.md`, write a devlog entry with the
numbers (`docs/devlog/README.md`), add any lessons to `docs/playbook.md`, and add to the running
totals in `docs/talk-notes.md`.

**Done:** M0–M7, and M8 steps 1–4, 6 and 7. **Open:** M8 steps 5 and 8, which wait for the
project lead. The steps below are kept as the record of what each milestone set out to do;
`docs/status.md` lists the PRs and devlog entries.

## M0 Scaffolding (done 2026-11-01)

1. pnpm workspace (`apps/web`, `apps/api`, `packages/shared`), TypeScript strict base config,
   ESLint flat config, Prettier, `.editorconfig`, `.gitignore` (incl. `.dev.vars`, `.wrangler/`,
   `.logs/`, Playwright output), `.nvmrc` (Node LTS).
2. `apps/web`: Vite + Vue 3 + Vue Router + Tailwind v4 + TanStack Query; a placeholder page.
   Design tokens (color, type, spacing) set once with the `tailwind-design-system` skill.
3. `apps/api`: Hono Worker serving `apps/web/dist` as static assets with SPA fallback,
   `GET /api/public/health`, security-headers middleware.
4. Test harness: Vitest workspaces, Testing Library, MSW, `@cloudflare/vitest-plugin`,
   Playwright + axe. One passing test per layer. `pnpm check` with one line per stage and logs
   in `.logs/latest/`. The component-layer test is a **theme switch** (System / Light / Dark,
   sets `data-theme` on `<html>`, remembered in `localStorage`) in the site header, with a
   pre-paint script so the page does not flash (`public/theme-init.js`, external so the CSP
   needs no hash). A dropdown with icons (user, 2026-11-01).
5. Middleware: `site-gate` (`SITE_MODE`) and `access-jwt`, with the required tests from
   `docs/testing.md`.
6. GitHub: Actions CI (PR checks), Dependabot, CodeQL, gitleaks, branch protection,
   `SECURITY.md`, `CONTRIBUTING.md`, README "Getting started".
7. Cloudflare: preview + prod Workers, D1, R2, Access applications (whole host); deploy from
   CI. Cloudflare's "Block AI bots" / managed robots.txt stay off (`docs/seo.md`). **Check:**
   both URLs ask for Google login; after login the placeholder page loads. workers.dev has no
   bot settings; they are checked when a domain is added.
8. `.claude/agents/builder.md`: standing rules for builders. Model `inherit` by default; the
   main session may pick a cheaper model for pure rote work (project lead). The "add a state
   source" guide moved to M2 step 12.

## M1 Data foundation (done 2026-11-01)

1. Drizzle schema + first migration for every table in `docs/data-model.md`, FTS5 table, with
   what `docs/seo.md` needs: a stable URL slug per state and code, and the state's publish date
   plus our last-updated date on each published version.
2. `packages/shared/src/codes.ts`: normalization, wildcards, ranges, list splitting,
   code-system inference. Table-driven tests from every pattern in `docs/sources.md`.
3. `packages/reference-data`: build `ref_codes` from the CMS ICD-10-CM and HCPCS Level II files
   (current fiscal year) into seed SQL. The yearly update is in its README.
4. Federal categories + auto-mapping keyword table. Statute wording confirmed and linked in
   `docs/sources.md`.
5. Diff + checks engine (pure functions in `packages/shared`) with tests for every check in
   `docs/ingestion.md`.
6. Deploy: `wrangler d1 migrations apply --remote` in `.github/workflows/deploy.yml`, with the
   D1 Time Travel bookmark recorded before production migrations (`docs/deployment.md`,
   "Backups and restore"; D1 cannot export a database with an FTS5 table). Reference-code load
   on preview and production (`packages/reference-data/README.md`).

## M2 Ingestion, admin (done 2026-11-02)

1. Admin shell: `/admin` layout, Access identity display, audit log page.
2. Watch dates page (`/admin/watch`, `docs/data-model.md`, "Watch dates"), seeded from the
   "Watch dates" table in `docs/status.md`, which is now history only.
3. Source upload to R2 with hash and duplicate warning.
4. Parser adapters (xlsx/csv, json, paste) + column mapping + column profiles.
5. PDF adapter (pdf.js in a Web Worker, row rebuilding). Fixtures for GA, LA, MT, NE.
6. Review table with flags and inline edits.
7. Draft versions: chunked row upload, checks report, diff view + CSV download.
8. Publish (atomic, per-state, pre-publish R2 backup) and rollback. Per-state isolation test.
9. Category mapping screen (auto vs confirmed; state default + chapter overrides).
10. AI cleanup: copy-paste prompt builder, then the optional Claude API endpoint behind the
    secret.
11. **Check:** load all four seed states through the UI on preview; re-load MT with a
    deliberately wrong file (NE's) and confirm the typed-confirm checks stop it.
12. "Add a new state source": the steps, written from loading the four seed states. Built as
    `docs/add-state-source.md`, served at `/admin/guide`; no separate agent skill (project
    lead).

## M3 Home page (done 2026-11-02)

1. Public `GET /api/public/states` with edge caching keyed on `data_version`.
2. `StateMap` (d3-geo Albers USA SVG): states colored by status, hover/focus card with code
   counts by code system and federal category, source date. Keyboard navigable, with a table
   view of the same data for screen readers and mobile.
3. State detail page: summary, sources with links and dates, version history, notes.
4. SEO/GEO groundwork (`docs/seo.md`): the Worker renders real HTML for public pages
   (`HTMLRewriter` into the built `index.html`: title, description, canonical, Open Graph,
   JSON-LD, page content), cached on `data_version`; `Dataset` JSON-LD and CSV/JSON downloads
   on state pages; `/sitemap.xml` from D1. **Check:** an e2e test with JavaScript disabled
   finds each state page's key facts.

## M4 Compare by category (done 2026-11-02)

1. `GET /api/public/compare`.
2. Compare page: pick a federal category (or a state's own category), code system filter, any
   number of states; aligned table (rows = codes, columns = states; exact / covered by wildcard
   / not listed), each cell with the state's tier label and qualification badge, and a filter
   for "qualifies alone". The URL holds the selection so links can be shared. CSV export.
   Server-rendered HTML per `docs/seo.md`; compare combinations are `noindex` (state and code
   pages are the canonical homes of each fact). Since M5 step 5 this table is at
   `/compare/codes`.

## M5 Compare across many states (done 2026-11-02)

After the M4 review the project lead found that a table with one column per state does not
scale to 51. Research and the approved mockup (https://claude.ai/artifact/CNrREiYvQSpfgNvcnR9VAz;
sources in `docs/devlog/2026-11-02-m5-plan.md`) gave three category levels and five views.
Decisions: this comes before code search; CCSR is used from the start (downloaded from AHRQ at
load time, never committed; licence on the legal list); one admin may approve a mapping, and
the public pages say who reviewed it and when.

1. **Unified categories (data model).** Admin-curated categories between the federal ones and
   each state's own: definition, includes, excludes, federal parent, draft/published, version.
   Mappings from a state category to one or more unified categories with a SKOS relation
   (exact, close, broad, narrow, related), basis, confidence, rationale, citation, mapped and
   reviewed by, status (proposed, approved, superseded; never deleted).
2. **CCSR reference data.** `packages/reference-data` downloads AHRQ's DXCCSR (pinned version
   and SHA-256) and builds `ref_ccsr` (ICD-10-CM code → CCSR category, one-to-many, default
   flag) and the category names; local loader and the Reference data workflow.
3. **Admin: unified categories and mappings.** Create and edit unified categories; a mapping
   screen per state with each category's CCSR spread as the suggestion, relation, basis,
   confidence, rationale and citation; approve (one admin, labelled); every change audited with
   a `data_version` bump.
4. **Coverage summary.** Computed after publish and mapping changes: per state × unified
   category (codes listed, universe, share qualifying alone). `GET /api/public/overview`.
5. **Overview matrix** (`/compare`): states × unified categories grouped by federal category;
   sort by any column, overall, or "similar states together"; each cell a number and a shade;
   a cell opens the drill-down. Server-rendered; a real table (WCAG 1.3.1, 1.4.1).
   5b. **Review follow-ups:** a code's federal category follows its unified categories' federal
   parents (M2 mapping as fallback); a never-published draft may be retired; the admin sources
   list stays under D1's 100-parameter limit; the overview's sort order in the URL.
6. **Category drill-down** (`/compare/<unified category>`): codes grouped by ICD-10-CM
   category, ranked by how many states list them; filters (everyone, gaps, only one state);
   focus state; details per code with each state's tier and badge; "Include codes no state
   lists" where the category's full code list is known (ICD-10-CM through CCSR).
7. **Compare 2–4 states** and **states like mine** (per-state-pair similarity computed in D1
   after placements change): only the differences, grouped by unified category, with shared
   and only-in counts; a ranked "most similar states" list on each state page.
8. **Tile map**: one unified category across all states, equal tiles with abbreviation and
   number, a table beneath. Moved from the home page to the Map tab (`/compare/map`) on
   2026-11-03.

## M6 Code search (done 2026-11-03)

1. FTS search endpoint with code-number and description matching, state and system filters.
   Search indexes every ICD-10-CM and HCPCS description, not only listed codes (project lead).
2. Search page with results as you type (debounced).
3. Code detail page: per-state status (exact, covered, narrower, like code, not listed), with
   labels explaining each.
   3b. Plain-language pass on all public text for a state Medicaid reader (added by the project
   lead; the legal list keeps every reworded item).
   3c. Contributor docs (`docs/getting-started.md`, a rewritten playbook), checked by running the
   setup in a fresh clone (added by the project lead).
4. Condition groups: seed list + admin editor; "like" codes on the code detail page.
5. Code detail pages server-rendered with `DefinedTerm` JSON-LD, a plain-sentence answer per
   state, and a sitemap entry for every listed code (`docs/seo.md`).

## M7 Admin completion (done 2026-11-03)

1. Manual backup download (a zip, project lead) and backup import (restore path 2).
2. Weekly cron backup + draft cleanup.
3. Remap screen: bulk remap, with the affected entries shown before saving.

## M8 Hardening and launch

Launch gate (user, 2026-11-01): **at least 2 states with every category mapping confirmed**,
and evidence that target users find the site useful and use it correctly.

1. **Done.** Data gate: `/admin/launch-readiness` lists each published state with its unified
   mappings that are missing or still proposed, and the categories its public page shows as "Not
   yet reviewed". At least 2 states must show 0 on all three. Federal mapping counts are shown
   for information only.
2. **Done.** Accessibility: axe clean in **both light and dark themes**, keyboard-only
   walkthrough, screen reader checklist (`docs/testing.md`).
3. **Done.** Performance: bundle size budget, Lighthouse ≥ 90 on the home page. SEO/GEO
   (`docs/seo.md`): `/llms.txt`, JSON-LD on every indexed page type. Still for the project lead:
   the Rich Results Test on each page type and the Cloudflare bot settings.
4. **Done.** Disclaimer, About/methodology page (matching, "like" codes, qualification badges),
   a dated note on court rulings (*Massachusetts v. Oz*), AMA notice, and "Report a problem".
   Professional site basics (project lead, 2026-11-02): favicon (SVG + 32 px PNG), Apple touch
   icon and `site.webmanifest` (our own mark; no CCF logo), an Open Graph share image, a footer
   (About, Disclaimer, source code, Report a problem, "data last updated"), privacy and
   accessibility statements, `/.well-known/security.txt`, print styles, a title and description
   on every page. **Check:** e2e finds the icons, manifest, share image and footer links on
   every public page type.
5. **Usability gate (open).** Invite 3–5 target users (state Medicaid staff, provider
   association staff, advocates) as guests in the preview Access policy. Give each one the task
   script in `docs/usability.md` (written in this step) with no help:
   - Find how many codes Montana lists and when its list was updated.
   - Compare the SUD codes of two states and name one code only one of them lists.
   - Find whether F20.0 qualifies in Louisiana, and which other states list it.
   - Tell an exact match from a "like" code, and say what the difference means.
   Pass: every participant finishes at least 3 of 4 tasks with the correct answer, and every
   problem that misleads a user (a wrong answer given with confidence) is fixed and re-tested.
   Record results in `docs/usability.md`.
6. **Done.** Cloudflare Web Analytics (free, no cookies, so no consent banner), off until
   `CF_BEACON_TOKEN` is set.
7. **Done, except the restore drill.** `security-review` (no findings), rate limits. D1
   database IDs come from GitHub environment variables at deploy time, so a new host can deploy
   without editing code (project lead, 2026-11-01). The restore drill on preview is still to do
   with the project lead.
8. **Go live (open)** (`docs/deployment.md`, "Going live"). Domain: the project lead buys one,
   or an organization hosts the site on its own domain. Then add the `Sitemap:` line to the
   public `robots.txt` (`apps/api/src/routes/robots.ts`) and set canonical URLs to that host.

## Later (not planned in detail)

- More states as they publish (a page listing states we know have announced, with links).
- A public "what changed" view between two versions of a state's list.
- Email or RSS when a state's list changes.
