# Roadmap

Each step is sized for one builder agent: do the step, run `pnpm check`, commit, stop. A
milestone is done when every step's acceptance check passes and `pnpm check:full` is green on
`main`. At the end of each milestone: update `docs/status.md`, write a devlog entry with the
numbers (`docs/devlog/README.md`), fill in that milestone's playbook sections, and add to the
running totals in `docs/talk-notes.md`.

## M0 Scaffolding

1. pnpm workspace (`apps/web`, `apps/api`, `packages/shared`), TypeScript strict base config,
   ESLint flat config, Prettier, `.editorconfig`, `.gitignore` (incl. `.dev.vars`, `.wrangler/`,
   `.logs/`, Playwright output), `.nvmrc` (Node LTS).
2. `apps/web`: Vite + Vue 3 + Vue Router + Tailwind v4 + TanStack Query; a placeholder page.
   Use the `tailwind-design-system` skill to set design tokens (color, type, spacing) once.
3. `apps/api`: Hono Worker serving `apps/web/dist` as static assets with SPA fallback,
   `GET /api/public/health`, security-headers middleware.
4. Test harness: Vitest workspaces, Testing Library, MSW, `@cloudflare/vitest-plugin`,
   Playwright + axe. One passing test per layer. `pnpm check` with one-line-per-stage output
   and logs in `.logs/latest/`. The component-layer test is a **theme switch** (System / Light /
   Dark, sets `data-theme` on `<html>`, remembered in `localStorage`) in the site header, with
   a pre-paint script so the page does not flash (`public/theme-init.js`, external so the CSP
   needs no hash). Built as a dropdown with icons (user, 2026-11-01).
5. Middleware: `site-gate` (`SITE_MODE`) and `access-jwt`, with the required tests from
   `docs/testing.md`.
6. GitHub: Actions CI (PR checks), Dependabot, CodeQL, gitleaks, branch protection,
   `SECURITY.md`, `CONTRIBUTING.md`, update `README.md` "Getting started" (`LICENSE` is already MIT).
   (The `.gitignore` additions for build outputs and `.dev.vars` were done in step 1.)
7. Cloudflare: create preview + prod Workers, D1, R2, Access applications (whole host); deploy
   from CI. Leave Cloudflare's "Block AI bots" / managed robots.txt off (`docs/seo.md`). **Check:** both URLs ask for Google login; after login the placeholder page loads.
   **Built 2026-11-01** (see devlog). workers.dev has no bot settings; they are checked when a
   domain is added. Migrations and the pre-release D1 backup join the deploy in M1.
8. `.claude/agents/builder.md` (standing rules for builders) and a project skill for "add a
   new state source" once M2 shows what the steps are.
   **Builder done 2026-11-01**: model `inherit` by default; the main session may pick a cheaper
   model for pure rote coding (project lead). The state-source skill moves to M2 (step 12 below).

## M1 Data foundation

1. **Done** (branch `m1-step1-schema`). Drizzle schema + first migration for every table in `docs/data-model.md`, FTS5 table.
   Include what `docs/seo.md` needs: a stable URL slug per state and code, and the state's
   publish date plus our last-updated date on each published version.
2. **Done** (branch `m1-step2-codes`). `packages/shared/codes.ts`: normalization, wildcard, range, list splitting, code-system
   inference. Table-driven tests from every pattern in `docs/sources.md`.
3. **Done** (branch `m1-step3-reference-data`). `packages/reference-data`: build `ref_codes` from the CMS ICD-10-CM and HCPCS Level II
   files (current fiscal year) into a seed SQL file. Document the yearly update in this doc.
4. **Done** (branch `m1-step4-categories`). Federal categories + auto-mapping keyword table. Confirm the statute wording and link it in
   `docs/sources.md`.
5. **Done** (branch `m1-step5-checks`). Diff + checks engine (pure functions in `packages/shared`) with tests for every check in
   `docs/ingestion.md`.
6. **Done** (branch `m1-step6-deploy-migrations`). Deploy: add `wrangler d1 migrations apply --remote` to `.github/workflows/deploy.yml`, and
   for production record the D1 Time Travel bookmark before migrating (`docs/deployment.md`,
   "Backups and restore"; D1 cannot export a database with an FTS5 table). Start the
   reference-code load on preview and production (two days each on the free tier; production
   from CI: `packages/reference-data/README.md`).

## M2 Ingestion (admin)

1. Admin shell: `/admin` layout, Access identity display, audit log page.
2. **Watch dates page** (`/admin/watch`, see `docs/data-model.md`, "Watch dates"). Seed it
   from the "Watch dates" table in `docs/status.md`, then keep that table only as history.
   Built early so dates are tracked in the app as soon as it exists.
3. Source upload to R2 with hash and duplicate warning.
4. Parser adapters (xlsx/csv, json, paste) + column mapping + column profiles.
5. PDF adapter (pdf.js in a Web Worker, row rebuilding). Fixtures for GA, LA, MT, NE.
6. Review table with flags and inline edits.
7. Draft versions: chunked row upload, checks report, diff view + CSV download.
8. Publish (atomic, per-state, pre-publish R2 backup) and rollback. Per-state isolation test.
9. Category mapping screen (auto vs confirmed; state default + chapter overrides).
10. AI cleanup: copy-paste prompt builder; then the optional Claude API endpoint behind the
    secret.
11. **Check:** load all four seed states through the UI on preview; re-load MT with a
    deliberately wrong file (e.g. NE's) and confirm the typed-confirm checks stop it.
12. Project skill "add a new state source": the steps for adding a state's source, written
    from what loading the four seed states actually took (moved from M0 step 8). Where it lives
    is the project lead's call: `.claude/skills/` is kept untracked for third-party skills.

## M3 Home page

1. Public `GET /api/public/states` with edge caching keyed on `data_version`.
2. `StateMap` (d3-geo Albers USA SVG): states colored by status, hover/focus card with code
   counts by code system and federal category, source date. Keyboard navigable, with a table
   view of the same data for screen readers and mobile.
3. State detail page: summary, sources with links and dates, version history, notes.
4. **SEO/GEO groundwork** (`docs/seo.md`): Worker renders real HTML for public pages
   (`HTMLRewriter` into the built `index.html`: title, description, canonical, Open Graph,
   JSON-LD, page content), cached on `data_version`; `Dataset` JSON-LD and CSV/JSON downloads
   on state pages; `/sitemap.xml` from D1. **Check:** an E2E test with JavaScript disabled
   finds each state page's key facts.

## M4 Compare by category

1. `GET /api/public/compare`.
2. Compare page: pick federal category (or a state's own category), code system filter, any
   number of states; aligned table (rows = codes, columns = states; exact / covered by
   wildcard / not listed), each cell with the state's tier label and qualification badge,
   and a filter for "qualifies alone". URL holds the selection so links can be shared. CSV export.
   Server-rendered HTML per `docs/seo.md`; compare combinations are `noindex` (state and
   code pages are the canonical homes of each fact).

## M5 Code search

1. FTS search endpoint with code-number and description matching, state and system filters.
2. Search page with results as you type (debounced).
3. Code detail page: per-state status (exact, covered, narrower, like code, not listed), with
   labels explaining each.
4. Condition groups: seed list + admin editor; "like" codes on the code detail page.
5. Code detail pages server-rendered with `DefinedTerm` JSON-LD, a plain-sentence answer per
   state, and a sitemap entry for every listed code (`docs/seo.md`).

## M6 Admin completion

1. Manual backup download and backup import (restore path 2).
2. Weekly cron backup + draft cleanup.
3. Remap screen polish: bulk remap, see affected entries before saving.

## M7 Hardening and launch

Launch gate (user, 2026-11-01): **at least 2 states with every category mapping confirmed**,
and evidence that target users find the site useful and use it correctly.

1. Data gate: an admin page "Launch readiness" lists each published state with its counts of
   unmapped and auto (unconfirmed) category mappings. At least 2 states must show 0 and 0.
   A test checks the page's logic.
2. Accessibility pass (axe clean in **both light and dark themes**, keyboard-only walkthrough,
   screen reader spot check).
3. Performance pass: bundle size budget, Lighthouse ≥ 90 on home page (`cloudflare:web-perf` skill).
   SEO/GEO pass (`docs/seo.md`): `/llms.txt`, Rich Results Test on each page type, Cloudflare
   bot settings re-checked.
4. Disclaimer, about/methodology page (how matching, "like" codes and qualification badges
   work), a dated note on court rulings (*Massachusetts v. Oz*), AMA notice, and a
   "Report a problem" link (a mailto, or a GitHub issue template for data errors).
   **Professional site basics** (project lead, 2026-11-02): favicon (SVG + 32 px PNG), Apple
   touch icon and `site.webmanifest` with the theme colour (our own simple mark; no CCF logo);
   an Open Graph / Twitter share image; a footer with About/methodology, disclaimer, source
   code, Report a problem and "data last updated"; a privacy note (no cookies, cookieless
   analytics, no personal data) and an accessibility statement; `/.well-known/security.txt`
   pointing to GitHub private vulnerability reporting; print styles for the compare table;
   a title and description on every page. **Check:** e2e finds the icons, manifest, share
   image and footer links on every public page type.
5. **Usability gate.** Invite 3–5 target users (state Medicaid staff, provider association
   staff, advocates) as guests in the preview Access policy. Give each one the task script in
   `docs/usability.md` (written in this step) with no help:
   - Find how many codes Montana lists and when its list was updated.
   - Compare the SUD codes of two states and name one code only one of them lists.
   - Find whether F20.0 qualifies in Louisiana, and which other states list it.
   - Tell an exact match from a "like" code, and say what the difference means.
   Pass: every participant finishes at least 3 of 4 tasks with the correct answer, and every
   problem that misleads a user (a wrong answer given with confidence) is fixed and
   re-tested. Record results in `docs/usability.md`.
6. Turn on Cloudflare Web Analytics (free, no cookies, so no consent banner) to see which
   pages people use after launch.
7. `security-review`, restore drill, rate limits verified.
   Portability: pass the D1 database IDs in at deploy time from GitHub environment variables
   (like `ACCESS_*`) instead of committing them in `wrangler.jsonc`, so a new host can deploy
   without editing code (project lead, 2026-11-01).
8. Go live (`docs/deployment.md`, "Going live"). Domain: the project lead buys one, or the
   site is given to an organization to host on its own domain. Then add the `Sitemap:` line to
   the public `robots.txt` (`apps/api/src/routes/robots.ts`) and set canonical URLs to that host.

## Later (not planned in detail)

- More states as they publish (a page listing states we know have announced, with links).
- "What changed" view between two versions of a state's list, public.
- Email/RSS when a state's list changes.
- Custom domain.
