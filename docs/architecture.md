# Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) everywhere | One language, shared types and schemas |
| Front end | Vue 3 (`<script setup>`), Vue Router, Vite, Tailwind CSS v4 | User's choice |
| Front-end data | TanStack Query for Vue (server cache); small Pinia store only for UI state if needed | Caching, retries and loading states without hand-written stores |
| Map | `d3-geo` + `us-atlas` (Albers USA), run once at build time in `packages/reference-data` (`src/us-map.ts`) into plain SVG paths (`packages/shared/src/us-map.json`, imported as `@mfcd/shared/us-map`). Browser and Worker ship no d3 | Small, no tile server, no API key, fully accessible; the same paths serve the server-rendered page (M3 step 4) |
| API | [Hono](https://hono.dev) on Cloudflare Workers (`nodejs_compat` on) | Small, typed routes, built for Workers, runs in Node for tests too |
| Validation | zod schemas in `packages/shared`, used by both the browser and the API | One definition of a valid row |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM + drizzle-kit migrations | Free tier, relational, SQL migrations in git |
| Search | SQLite FTS5 virtual table on code + description | Built into D1, no extra service |
| File storage | Cloudflare R2 (source documents, backups) | 10 GB free, no egress fees |
| Auth | Cloudflare Access (Google IdP), JWT verified in the Worker with `jose` | No auth code to get wrong; free for up to 50 users |
| Parsing | `pdfjs-dist` and `read-excel-file` run in the admin's browser | No server CPU cost; untrusted files never get parsed on the server |
| Testing | Vitest, Vue Testing Library, MSW, `@cloudflare/vitest-plugin`, Playwright, axe-core | See `docs/testing.md` |
| Tooling | pnpm workspaces, ESLint (flat config, `eslint-plugin-vue`, `typescript-eslint`), Prettier | Standard |

The design wiki says "NodeJS" for the back end. Workers run a V8 runtime with Node API
compatibility (`nodejs_compat`), not a Node process. Hono keeps the API portable: if we ever
leave Cloudflare, the same app runs on Node with `@hono/node-server` and a Postgres/SQLite
driver behind Drizzle.

## Repo layout (created in M0)

```
apps/
  web/                 Vue SPA (public pages + /admin pages)
    src/
      pages/           file-based routes: (home).vue, compare.vue, search.vue, codes/[codeId].vue, admin/*
      styles/main.css  Tailwind import + design tokens (@theme), light and dark
      components/      UI components (StateMap, CodeTable, StatePicker, ...)
      composables/     useStates, useCompare, useCodeSearch (TanStack Query wrappers)
      ingest/          browser-side parser adapters (pdf, xlsx, csv, json) -> RawRow[]
      lib/             api client (typed from packages/shared), formatting
    e2e/               Playwright specs
  api/                 Hono app deployed as the Worker (also serves apps/web/dist as static assets)
    src/
      routes/public/   GET-only public endpoints
      routes/admin/    admin endpoints (Access JWT required)
      db/              drizzle schema + queries
      middleware/      access-jwt, site-gate, security-headers, rate-limit, errors
    migrations/        D1 SQL migrations (drizzle-kit generated, reviewed by hand)
    wrangler.jsonc
packages/
  shared/              zod schemas, API types, code normalization (pure functions, no I/O)
  reference-data/      builds ref_codes (ICD-10-CM, HCPCS) from pinned CMS files; resumable loader;
                       builds the US map paths (`pnpm --filter @mfcd/reference-data us-map`)
fixtures/              small excerpts of real state files + expected normalized output
docs/
```

## Tool versions

Exact versions live in the root `package.json`; the notes here say why some are held back.

- **Node 26** (LTS "Lithium"). `.nvmrc` holds the major only, so patch releases are picked up.
- **pnpm 12**, installed by hand (`npm i -g pnpm@12.16.1`); corepack is gone from Node 25+.
  `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` (3 days): pnpm refuses any package
  published less than 3 days ago, which blocks most hijacked releases. If a pin is too new,
  step back to the previous release rather than adding an exclude.
- **TypeScript 6.0.x, not 7.** TypeScript 7 (the native Go port) is `latest` on npm, but
  `typescript-eslint` 8.x supports only `<6.1.0` and `vue-tsc` needs the JS compiler API that 7
  dropped. Revisit when both support 7. TS 6 changed some defaults (`types` is `[]`), so
  `tsconfig.base.json` sets every option explicitly.
- **Drizzle: `drizzle-orm` 0.45.x and `drizzle-kit` 0.31.x**, the stable lines. 1.0 is still
  an RC (2026-11-01); revisit when it is final. drizzle-kit 0.31 pulls the deprecated
  `@esbuild-kit` loader with an old esbuild (one moderate dev-only advisory about esbuild's dev
  server, which drizzle-kit does not start). `pnpm audit --prod` is clean. Migrations: change
  `apps/api/src/db/schema.ts`, run `pnpm db:generate`, review the SQL. Virtual tables (FTS5)
  and triggers go in hand-written migrations (`drizzle-kit generate --custom --name <x>`).
- **`d3-geo` 3.1.1, `topojson-client` 3.1.0, `us-atlas` 3.0.1** (dev only, `packages/reference-data`):
  build the map paths. A test fails if the committed `us-map.json` no longer matches.
- **`fflate` 0.8.x** unzips the CMS files in `packages/reference-data` (no dependencies).
- **ESLint 10**, flat config built with `defineConfig()` from `eslint/config`
  (`tseslint.config()` is deprecated). Linting is type-aware (`strictTypeChecked`).
- **Vue Router 5, file-based routing built in.** `unplugin-vue-router` is deprecated ("Merged
  into vuejs/router"). Use the `vue-router/vite` plugin and import from `vue-router` and
  `vue-router/auto-routes`, not `vue-router/auto` as the `vue-development` skill's routing guide
  still shows. The plugin writes `apps/web/src/typed-router.d.ts`; it is committed (so
  `vue-tsc` works on a clean checkout) and ignored by ESLint and Prettier.
- **`apps/web` typecheck is `vue-tsc --build`** over `tsconfig.app.json` (DOM, `vite/client`)
  and `tsconfig.node.json` (`vite.config.ts`). `src/env.d.ts` declares `*.vue` modules only so
  typescript-eslint can type `.vue` imports in `.ts` files.
- **Vite 8** (Rolldown). `vue-demi` (pulled in by TanStack Query) wants a postinstall script;
  pnpm blocks it and that is fine, because its default build already targets Vue 3.
- **Fonts are self-hosted** from Fontsource npm packages (Jost, Source Sans 3, IBM Plex Mono;
  all SIL OFL). No Google Fonts requests, so the CSP can keep `font-src 'self'`. CCF's own
  fonts (Futura PT, Adobe Caslon Pro) are licensed to CCF through Adobe Fonts and cannot be used.

- **Hono 4.13, wrangler 4.156.** `apps/api/worker-configuration.d.ts` is generated by
  `pnpm --filter @mfcd/api cf-types` (`wrangler types --strict-vars=false`) and committed; rerun
  it after editing `wrangler.jsonc`. It replaces `@cloudflare/workers-types` and any hand-written
  `Env`. `compatibility_date` is the newest date the pinned wrangler's workerd supports
  (2026-10-23); bump both together. pnpm blocks the `esbuild` and `workerd` install scripts;
  both still work because their platform binaries come as optional dependencies.
- **Dev:** `pnpm dev` builds the web app in watch mode and runs `wrangler dev` on :8787 (one
  URL, real headers and CSP). `pnpm --filter @mfcd/web dev` gives hot reload on :5173 and
  proxies `/api` to :8787. `pnpm build` = web build + `wrangler deploy --dry-run`.

- **Testing tools:** Vitest 5.0.5, `@cloudflare/vitest-plugin` 1.4.11 (the renamed
  `vitest-pool-workers`), Testing Library for Vue 8.1, MSW 3, jsdom 30, Playwright 1.64,
  axe-core 4.14. Details in `docs/testing.md`, "Setup".
- **pnpm build scripts:** `pnpm-workspace.yaml` lists `esbuild`, `vue-demi` and `workerd` under
  `allowBuilds: false`. pnpm 12 fails the install (`ERR_PNPM_IGNORED_BUILDS`) for any package
  with an unreviewed install script, so a new one must be reviewed and added there.
- **`apps/web/vite.config.ts` gives the router plugin an absolute `root`.** Without it, running
  Vitest from the repo root wrote an empty `src/typed-router.d.ts` at the repo root.

## Design tokens

Set once in M0 step 2 in `apps/web/src/styles/main.css`; approved palette page:
https://claude.ai/artifact/Ky9pvJ3qnF3NBvkLLrDu9F (private to the project lead).

- Colours start from the Georgetown CCF palette (navy, blue, gold, red). The site is **not**
  a CCF site and carries no CCF name or logo; branding may be added later with CCF's approval.
- Tailwind's default palette is removed (`--color-*: initial`); only semantic tokens exist
  (`background`, `surface`, `foreground`, `heading`, `muted-foreground`, `link`, `primary`,
  `ring`, `border`, `input-border`, `accent`, `highlight`, `danger`, `header`, four badge pairs).
  Every text pair passes WCAG AA in both themes. Gold `accent` is for rules only, never text.
- Type scale and spacing are Tailwind's defaults. Fonts: `font-display` (Jost) for headings,
  `font-sans` (Source Sans 3) for body and tables, `font-mono` (IBM Plex Mono, dotted zero) for codes.
- Themes: no `data-theme` on `<html>` = follow the system; `data-theme="light"|"dark"` = the
  user's choice, set by the header's theme menu (`components/ThemeMenu.vue`, icons + dropdown)
  and stored in `localStorage` as `mfcd-theme`. `public/theme-init.js` applies it before first
  paint. Prefer tokens over `dark:`.

## Agent skills (not committed)

These AI-assistant skills were installed by the project lead before M0. Their folders are
**left untracked on purpose**: do not commit, edit or delete `.agents/`, `.claude/skills/` or
`skills-lock.json`. Prettier and ESLint ignore them. To reproduce the setup:

| Skill | Source | How it was installed | Where it lands |
| --- | --- | --- | --- |
| `tailwind-design-system` | GitHub `wshobson/agents`, path `plugins/frontend-mobile-development/skills/tailwind-design-system/SKILL.md` | skills CLI (`npx skills add`, which writes `skills-lock.json`) | `.agents/skills/tailwind-design-system/` |
| `unslop` | GitHub `theclaymethod/unslop` (`SKILL.md` at repo root) | skills CLI | `.agents/skills/unslop/`, symlinked from `.claude/skills/unslop` |
| `vue-development` | Claude Code plugin from marketplace GitHub `alexanderop/claude-skill-vue-development` (v0.1.0) | `/plugin marketplace add alexanderop/claude-skill-vue-development`, then `/plugin install vue-development`, project-local scope | Claude Code plugin cache (outside the repo) |

Claude Code reads project skills from `.claude/skills/`. The skills CLI linked only `unslop`
there, so `tailwind-design-system` was invisible to Claude Code until it was linked by hand
(2026-11-01). On a fresh setup, after installing both skills, run:
`ln -s ../../.agents/skills/tailwind-design-system .claude/skills/`.

## One Worker, two halves

A single Worker handles every request, so there is one deploy, one domain and one Access setup.

```
Browser ──► Cloudflare edge ──► [Access: whole site pre-launch; /admin* + /api/admin* after]
                                   │
                                   ▼
                              Worker (Hono)
            ┌──────────────────────┼───────────────────────────┐
     /api/public/*           /api/admin/*                 everything else
     GET only, cached        Access JWT verified,         static assets (Vue build)
     at the edge             writes to D1/R2              SPA fallback to index.html
            │                      │
            ▼                      ▼
           D1  ◄───────────────── D1, R2
```

Until launch, **every** request runs the Worker first (`assets.run_worker_first: true` in
`apps/api/wrangler.jsonc`), so the security headers and the site gate cover static files too.
The Worker hands non-API paths to `env.ASSETS`, which falls back to `index.html` for unknown
paths; unknown `/api/*` paths get a JSON 404 instead. Each page view costs about 6–8 Worker
requests (HTML, JS, CSS, fonts), which is free at admin-only traffic. At go-live, hashed
`/assets/*` files move to direct serving (no Worker run, not counted toward the quota); see
`docs/deployment.md`, "Going live".

## API shape (first draft)

Public (read only, `GET`, cacheable):

| Route | Returns |
| --- | --- |
| `/api/public/states` | Every state and DC by name: status, and for a published list its version number, source date (the version's, else its newest source's), last update, entry counts by code system, federal category (`federalCategoriesOf`: an entry counts under each of its unified categories' federal parents, so these can add up to more than the entries) and qualification, and whether every mapping is confirmed (placements reviewed; unplaced entries mapped by hand). `dataVersion` too. Feeds the home map (`publicStatesResponseSchema`) |
| `/api/public/states/:slug` | One state (`ga` or `GA`): the same summary, `notesMd`, the published version's sources (non-http URLs shown as unknown), published and replaced versions (never drafts), and its categories with federal category, entries and whether the mapping is confirmed (`publicStateDetailResponseSchema`). 404 for anything else. Counting is shared with the list (`apps/api/src/db/public-summary.ts`) |
| `/states/:slug/codes.csv`, `/states/:slug/codes.json` | Downloads of a published list (not under `/api/`, so crawlers may fetch them): every entry with its federal categories (CSV `federal_categories`, labels joined by `; `; JSON `federalCategories`, a list) and source citation. 404 when the state has no list |
| `/compare` (HTML, indexed) | The overview matrix (M5 step 5): every state against every published unified category, from `publicOverview()`, in the order the URL asks for: `?order=similar`, `?order=overall` or `?sort=<category slug>`, with `&dir=asc` for lowest first (defaults, by name and highest first, left out; `sort=overall` reads as `order=overall`; `overviewOrderFromQuery`). `/compare` with a code-table query answers 301 to `/compare/codes` (and `/compare.csv?…` to `/compare/codes.csv`) |
| `/compare/codes?…` (HTML, `noindex`), `/compare/codes.csv?…` | The code table server-rendered for the selection in the URL, and every row of it as CSV (a column group per state: status, entry, tier, qualification, basis, state category and federal categories). Same query as `/api/public/compare`; the CSV ignores `page`; 400 for a bad query |
| `/`, `/states`, `/states/:slug`, `/sitemap.xml` | Server-rendered HTML pages and the sitemap (`apps/api/src/routes/pages.ts`, `docs/seo.md`) |
| `/api/public/categories/:slug?show=&system=&all=1&focus=&page=` | The category drill-down (M5 step 6), one **published** unified category (404 for a draft, retired or unknown slug): `category` (label, definition, includes, excludes, federal parent, version, `universeSize`, CCSR groups with names), `states` (those with a list: the N of "n of N"), `systems`, `query` as applied (a focus without a list, a system with no rows and `all` without a universe are dropped), `totalRows`, `totalGroups`, `page`, `pageCount`, and `groups` (ICD-10-CM 3-character category, or code system; `anyCount` = states listing or covering any of its codes; `rowCount`) with their `rows` (`key` = `comparePatternKey`, display, CMS or state text, `count` = states with a list that list or cover it, `rules` = counts per qualification with how many are inferred, and the focus state's `focus` cell in the M4 statuses). Rows: entries placed in the category (`entry_unified`), plus with `all=1` every universe code not already a row. Filters: `show=everyone` (count = N), `gaps` (count < N/2), `one` (count = 1). Groups by `anyCount` then key, rows by count then code; a page holds the groups that start within its first 250 rows (`DRILL_PAGE_ROWS`). Counted in D1 SQL (`apps/api/src/db/public-drill.ts`), not in Worker JavaScript. Lenient query: anything unreadable falls back to its default (`drillQueryFromRecord`) (`drillResponseSchema`) |
| `/api/public/categories/:slug/detail?code=<pattern key>` | Every state (by name) for one row: `hasList` and its cell (listed, covered by X, n narrower codes, not listed, no list), with tier, rule and the state's own category; the row with its count. 400 for a missing or unreadable `code`, 404 as above (`drillDetailResponseSchema`) |
| `/compare/:slug` (HTML; indexed bare, `noindex` with any query), `/compare/:slug/codes.csv?show=&system=&all=1` | The drill-down server-rendered (every group of the page expanded, a GET form for the filters, Details links that render the details below) and every row of the view as CSV (`code_system, code, description, description_source, group, states_listing, states_with_list`, then a status column per state with a list in the M4 words; `page`, `focus` and `code` ignored). 404 page for a slug that is not a published category |
| `/api/public/compare?states=GA,LA&category=sud` (or `&ownState=LA&ownCategory=…&ownSubcategory=…` for one state's own category) `&system=&alone=1&page=` | One category's codes, wildcards and ranges, aligned across the selected states (columns in the order given; the own-category state first), 100 rows a page. Each cell: listed / covered by a broader entry / narrower codes listed / not listed / no list, with the state's entry, tier, qualification and category. Cells look through the state's whole list, so a code filed under another category still shows. Descriptions: CMS text for ICD-10-CM and HCPCS, else the first column state's own text, named. 400 for a bad query or unknown state. `buildCompare()` in `packages/shared/src/compare.ts`, loaded by `apps/api/src/db/public-compare.ts` (`compareResponseSchema`) |
| `/api/public/overview` | Every state and DC (by name, with `hasList`) against every **published** unified category (by federal parent, sort order, label; with its `coverageBasis` and `denominator`). Per state with a list, one cell per category: entries placed, entries qualifying alone and their share, `covered` and `share` (universe codes covered, or distinct entries over all states' distinct entries), and whether every placement was reviewed. `dataVersion` too. SQL aggregates over the precomputed `entry_unified` and `unified_universe` (`apps/api/src/db/public-overview.ts`); no entry is placed per request (Free plan: 10 ms CPU). Definitions: `docs/data-model.md`, "Coverage summary" (`publicOverviewResponseSchema`) |
| `/api/public/codes/search?q=&states=&system=` | FTS search over code numbers and descriptions |
| `/api/public/codes/:system/:code` | Which states list this code (exactly, or via a wildcard/range/parent), plus "like" codes |

Admin (Access JWT required; all writes):

| Route | Purpose |
| --- | --- |
| `GET /api/admin/states` | Every state and DC (id, name, status), by name |
| `GET /api/admin/sources?stateId=&sha256=` | A state's stored source files, newest first, with the versions built from each (looked up 100 ids per query: D1's bound-parameter limit); `sha256` finds one file (the duplicate check) |
| `POST /api/admin/sources?stateId=&title=&fileType=&sha256=&url=&publisherDate=` | Body: the raw file (`application/octet-stream`, ≤ 25 MB; the only non-JSON write). The Worker re-hashes it and checks its first bytes against `fileType`. Same file already stored for the state: 200 with `duplicate: true`, nothing written. Else R2 (random key, `attachment`), then the row and audit: 201 |
| `GET /api/admin/sources/:id/file` | Download the original, always as an attachment |
| `GET /api/admin/column-profiles?stateId=&headerKey=` | The saved column profile for a state's header layout (`headerKey()` in `packages/shared/src/ingest.ts`), or `{item: null}` |
| `PUT /api/admin/column-profiles` | Save it: `{stateId, header, profile}`; the server computes the key; one role per column |
| `POST /api/admin/ref-codes/lookup` | Body `{codes}`: up to 1,000 normalized codes. Returns the ones in `ref_codes` with their system (ICD-10-CM or HCPCS) and billable flag. A read sent as POST (the list does not fit in a URL); D1 is asked 100 codes per query |
| `GET /api/admin/drafts?stateId=` | A state's open drafts, newest first |
| `POST /api/admin/drafts` | Start a draft version for a state (`{stateId}`); the version number is set in the same statement, so two at once cannot clash |
| `GET /api/admin/drafts/:id` | The version, with one item per part sent (file, table, entries stored of expected, invalid rows, states named) |
| `PUT /api/admin/drafts/:id/sources/:sourceId` | Add one part (table or sheet) of a stored source: `{part, expectedEntries, invalidRowCount, namedStateIds}`. Sending a part again deletes only its entries. The source must belong to the draft's state; only a `draft` changes (409 otherwise) |
| `POST /api/admin/drafts/:id/rows` | `{sourceDocumentId, part, entries}`, ≤ 500 entries. Each entry is re-parsed (`validateDraftEntry`); a mismatch answers 400 with its `index`, and nothing is stored. More entries than announced: 400 |
| `GET /api/admin/drafts/:id/checks` | Runs `runChecks` on the stored rows (ref_codes for unknown ICD-10-CM, the published version for the diff), stores `{report, token, ranAt}` in `check_report_json`. `token` is a SHA-256 of the entry ids and parts |
| `POST /api/admin/drafts/:id/discard` | Mark a draft `discarded` (kept for the record) |
| `POST /api/admin/drafts/:id/publish` | `{token, confirmations}`. Re-runs the checks; a token that no longer matches the rows answers 409; missing confirmations 400 with `missing`. Then the R2 backup of the replaced version, then one `db.batch()`: merge duplicates, supersede, publish, move the state pointer, bump `data_version`, audit |
| `GET /api/admin/states/:stateId/versions` | A state's versions, newest first |
| `GET /api/admin/states/:stateId/categories` | Categories of the published version and open drafts (counts, mapping, keyword guess, and how many published entries follow their unified categories and under which federal categories: `placedEntries`, `placedFederal`), and the 22 ICD-10-CM chapters (counts, override) |
| `PUT /api/admin/states/:stateId/categories` | `{items: [{stateCategory, stateSubcategory, federalCategory}]}` (≤ 200): confirmed mappings |
| `PUT /api/admin/states/:stateId/chapters/:chapter` | `{federalCategory}` sets a chapter override, `null` clears it |
| `GET /api/admin/unified` | Every unified category (all statuses) with its CCSR groups (ids and names) and its count of approved mappings |
| `POST /api/admin/unified`, `PUT /api/admin/unified/:id` | Create or edit (`unifiedCategoryBodySchema`). Slug defaults to the label (kept on edit); a taken slug is 409. `version` + 1 when label, definition, includes or excludes change. Status: draft → published or retired (a draft never published may be retired), published ⇄ retired, never back to draft (409). The CCSR set is replaced in the same `db.batch()` as the row and the audit row; `data_version` + 1 unless the category was a draft and is not published now |
| `GET /api/admin/ccsr-categories` | All CCSR categories (id, name, body system) for the picker |
| `GET /api/admin/states/:stateId/unified-mappings` | The categories of the **published** list (entries, ICD-10-CM entries), their current approved and proposed rows, and a suggestion: the CCSR groups of the ICD-10-CM entries (`ccsrGroupsCovered`, top 8) and the unified categories (any status) sharing them, with the share of entries each would cover. `ref_ccsr` is read as key ranges, 49 per query |
| `PUT /api/admin/states/:stateId/unified-mappings` | One state category, `{targets: [...]}` or `{byCode: true}`, and `approve`. One batch: insert the new rows (approved with reviewed_by/at, or proposed), mark the current proposed rows (and approved ones when approving) `superseded`, pointing at the first new row; audit; `data_version` + 1 when approving. Never deletes |
| `POST /api/admin/states/:stateId/unified-mappings/approve` | Approve the current proposal as is (any admin, its author included): the approved rows are superseded by it. 409 when there is none |
| `POST /api/admin/states/:stateId/rollback` | `{versionId}`: re-publish a superseded version of the same state, in one batch (404 for another state's version, 409 for one that was never published) |
| `GET /api/admin/ai-cleanup` | `{enabled, model}`: whether the "Ask Claude" button shows |
| `POST /api/admin/ai-cleanup` | `{stateId, fileName, part}`. 404 unless `ANTHROPIC_API_KEY` is set. The server builds the prompt (so the key only serves this task), calls Claude (`@anthropic-ai/sdk`, streaming, `fallbacks: "default"`), audits model and tokens (never the text), and returns the answer as text for the browser to validate. 30 calls an hour across all admins (counted in `audit_log`); a refusal or a cut-off answer is 422 |
| `GET /api/admin/backup` | Stream a full JSON backup to the admin's computer |
| `GET /api/admin/audit?limit=&before=` | Audit log, newest first; `before` is the last id of the previous page (cursor), `limit` 1–200 (default 50) |
| `GET /api/admin/watch?status=open\|closed`, `POST /api/admin/watch`, `PUT /api/admin/watch/:id` | Watch dates: list, add, edit, close. `PUT` body is `{action: 'edit', ...fields}` or `{action: 'close', status, resolutionMd}`; a closed item answers 409 |

## Caching

Public responses carry `Cache-Control: public, max-age=300` and are stored in the Workers
Cache API under a key that includes a global `data_version` number. Each publish or rollback
increments `data_version`, so stale cache entries are never read again. This keeps D1 reads
low enough to stay inside the free tier. **While `SITE_MODE` is private, skip the shared cache
and send `Cache-Control: private`**, so a response that needed a login is never stored where
someone without one could read it.

The middleware is `apps/api/src/middleware/public-cache.ts` (`publicCache`, or `cachePublic()`
with options): it reads `data_version` (one row), and in public mode looks up the URL plus
`__dv=<data_version>` and `__wv=<Worker version id>` (`CF_VERSION_METADATA`, so a deploy starts
with an empty cache) in `caches.default`; only 200 responses are stored. Server-rendered pages
add a hash of the built `index.html` to the key and tell browsers to revalidate
(`max-age=0, must-revalidate`) while the edge keeps its copy 5 minutes. Non-GET and private-mode responses get
`Cache-Control: private, no-store`. The Cache API is a no-op on `*.workers.dev` hosts, so the
shared cache starts working only on a custom domain (M8); until then each request reads D1
(about 68 ms locally for the four seed states, 17k entries).

## Site gate (pre-launch)

`SITE_MODE` (`private` | `public`) is a Worker variable. When it is `private` (or anything but
exactly `public`), the Worker requires a valid Access JWT on **every** route, static assets
included (`assets.run_worker_first = true`), from any identity Access let in, and sends
`X-Robots-Tag: noindex, nofollow`. This sits on top of the Access policy, so a mistake in the
Access config alone cannot expose the site. Admin routes (`/admin*`, `/api/admin*`) also need an
email in `ADMIN_EMAILS`, in both modes. Going live is described in `docs/deployment.md`.

`robots.txt` is served by the Worker (`apps/api/src/routes/robots.ts`):

- Private: `User-agent: *` / `Disallow: /`.
- Public: `Allow: /`, `Disallow: /admin`, `Disallow: /api/` (crawling the JSON API would only
  use up the free request quota). Add a `Sitemap:` line once there is a custom domain (M8).
