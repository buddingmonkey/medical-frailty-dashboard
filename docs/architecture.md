# Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) everywhere | One language, shared types and schemas |
| Front end | Vue 3 (`<script setup>`), Vue Router, Vite, Tailwind CSS v4 | User's choice |
| Front-end data | TanStack Query for Vue (server cache); small Pinia store only for UI state if needed | Caching, retries and loading states without hand-written stores |
| Map | `d3-geo` + `us-atlas` TopoJSON rendered as inline SVG (Albers USA) | Small, no tile server, no API key, fully accessible |
| API | [Hono](https://hono.dev) on Cloudflare Workers (`nodejs_compat` on) | Small, typed routes, built for Workers, runs in Node for tests too |
| Validation | zod schemas in `packages/shared`, used by both the browser and the API | One definition of a valid row |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM + drizzle-kit migrations | Free tier, relational, SQL migrations in git |
| Search | SQLite FTS5 virtual table on code + description | Built into D1, no extra service |
| File storage | Cloudflare R2 (source documents, backups) | 10 GB free, no egress fees |
| Auth | Cloudflare Access (Google IdP), JWT verified in the Worker with `jose` | No auth code to get wrong; free for up to 50 users |
| Parsing | `pdfjs-dist` and SheetJS CE run in the admin's browser | No server CPU cost; untrusted files never get parsed on the server |
| Testing | Vitest, Vue Testing Library, MSW, `@cloudflare/vitest-pool-workers`, Playwright, axe-core | See `docs/testing.md` |
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
      pages/           route components (Home, Compare, Search, CodeDetail, admin/*)
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
  reference-data/      scripts that build the ICD-10-CM / HCPCS reference tables from CMS files
fixtures/              small excerpts of real state files + expected normalized output
docs/
```

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

Static asset requests do not run the Worker and do not count toward the request quota.

## API shape (first draft)

Public (read only, `GET`, cacheable):

| Route | Returns |
| --- | --- |
| `/api/public/states` | Every state with status, counts by category and code system, source date. Feeds the home map |
| `/api/public/states/:st` | One state's summary, sources, notes |
| `/api/public/categories` | The federal categories and how each state maps to them |
| `/api/public/compare?category=&states=GA,LA&system=` | Codes in that category for each selected state, aligned by code |
| `/api/public/codes/search?q=&states=&system=` | FTS search over code numbers and descriptions |
| `/api/public/codes/:system/:code` | Which states list this code (exactly, or via a wildcard/range/parent), plus "like" codes |

Admin (Access JWT required; all writes):

| Route | Purpose |
| --- | --- |
| `POST /api/admin/sources` | Upload the original file to R2, record its hash and metadata |
| `POST /api/admin/drafts` | Start a draft version for a state |
| `POST /api/admin/drafts/:id/rows` | Add validated rows in chunks (≤ 500 rows per request) |
| `GET /api/admin/drafts/:id/checks` | Run the data checks and diff against the published version |
| `POST /api/admin/drafts/:id/publish` | Publish (needs the confirmation token from the checks) |
| `POST /api/admin/states/:st/rollback` | Re-publish an earlier version |
| `PUT /api/admin/category-mappings/:id` | Remap a state category to a federal category |
| `POST /api/admin/ai-cleanup` | Optional; only exists when `ANTHROPIC_API_KEY` is set |
| `GET /api/admin/backup` | Stream a full JSON backup to the admin's computer |
| `GET /api/admin/audit` | Audit log |
| `GET, POST /api/admin/watch`, `PUT /api/admin/watch/:id` | Watch dates: list, add, edit, close (close requires a resolution note) |

## Caching

Public responses carry `Cache-Control: public, max-age=300` and are stored in the Workers
Cache API under a key that includes a global `data_version` number. Each publish or rollback
increments `data_version`, so stale cache entries are never read again. This keeps D1 reads
low enough to stay inside the free tier.

## Site gate (pre-launch)

`SITE_MODE` (`private` | `public`) is a Worker variable. When it is `private`, the Worker
requires a valid Access JWT on **every** route, static assets included (this needs
`assets.run_worker_first = true`), and sends `X-Robots-Tag: noindex` plus a disallow-all
`robots.txt`. This sits on top of the Access policy, so a mistake in the Access config alone
cannot expose the site. Going live is described in `docs/deployment.md`.
