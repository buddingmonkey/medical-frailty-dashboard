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
   from CI. **Check:** both URLs ask for Google login; after login the placeholder page loads.
8. `.claude/agents/builder.md` (standing rules for builders) and a project skill for "add a
   new state source" once M2 shows what the steps are.

## M1 Data foundation

1. Drizzle schema + first migration for every table in `docs/data-model.md`, FTS5 table.
2. `packages/shared/codes.ts`: normalization, wildcard, range, list splitting, code-system
   inference. Table-driven tests from every pattern in `docs/sources.md`.
3. `packages/reference-data`: build `ref_codes` from the CMS ICD-10-CM and HCPCS Level II
   files (current fiscal year) into a seed SQL file. Document the yearly update in this doc.
4. Federal categories + auto-mapping keyword table. Confirm the statute wording and link it in
   `docs/sources.md`.
5. Diff + checks engine (pure functions in `packages/shared`) with tests for every check in
   `docs/ingestion.md`.

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

## M3 Home page

1. Public `GET /api/public/states` with edge caching keyed on `data_version`.
2. `StateMap` (d3-geo Albers USA SVG): states colored by status, hover/focus card with code
   counts by code system and federal category, source date. Keyboard navigable, with a table
   view of the same data for screen readers and mobile.
3. State detail page: summary, sources with links and dates, version history, notes.

## M4 Compare by category

1. `GET /api/public/compare`.
2. Compare page: pick federal category (or a state's own category), code system filter, any
   number of states; aligned table (rows = codes, columns = states; exact / covered by
   wildcard / not listed), each cell with the state's tier label and qualification badge,
   and a filter for "qualifies alone". URL holds the selection so links can be shared. CSV export.

## M5 Code search

1. FTS search endpoint with code-number and description matching, state and system filters.
2. Search page with results as you type (debounced).
3. Code detail page: per-state status (exact, covered, narrower, like code, not listed), with
   labels explaining each.
4. Condition groups: seed list + admin editor; "like" codes on the code detail page.

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
4. Disclaimer, about/methodology page (how matching, "like" codes and qualification badges
   work), a dated note on court rulings (*Massachusetts v. Oz*), AMA notice, and a
   "Report a problem" link (a mailto, or a GitHub issue template for data errors).
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
8. Go live (`docs/deployment.md`, "Going live").

## Later (not planned in detail)

- More states as they publish (a page listing states we know have announced, with links).
- "What changed" view between two versions of a state's list, public.
- Email/RSS when a state's list changes.
- Custom domain.
