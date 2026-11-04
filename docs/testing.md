# Testing

## Layers

| Layer | Tool | Where | What it covers |
| --- | --- | --- | --- |
| Unit | Vitest | `packages/shared/**/*.test.ts` | Code normalization, wildcard/range parsing, code-system inference, category auto-mapping, diff + checks logic. **The most important tests in the repo** |
| Parser | Vitest (jsdom) | `apps/web/src/ingest/**/*.test.ts` | Each adapter; PDF layout on synthetic pages and on real pages of each seed state (`fixtures/pdf-pages-*.json`) |
| Component | Vitest + `@testing-library/vue` + MSW | `apps/web/src/**/*.test.ts` | User-visible behavior: pick states, see table, search results, admin review table. Mock the API with MSW, never mock composables |
| API | Vitest + `@cloudflare/vitest-plugin` | `apps/api/src/**/*.test.ts` | Routes running in workerd with a real local D1 and R2 (Miniflare). Auth middleware, site gate, publish/rollback, per-state write isolation |
| E2E | Playwright | `apps/web/e2e/` | Main journeys in Chromium against `wrangler dev` with seeded local D1: home map → state, compare, search → code detail, admin ingest → publish → rollback. `*.admin.spec.ts` run in the `admin` project: a second Worker on :8789 in development mode (the localhost bypass signs in `e2e-admin@localhost`) with its own migrated local D1 in `apps/api/.wrangler/e2e-admin` |
| Accessibility | `@axe-core/playwright` | in E2E specs | No serious/critical axe violations on every public page. State agencies often need Section 508 / WCAG 2.1 AA |
| Deployed smoke | Playwright (small spec) | CI after deploy | Preview: everything returns 401/302 without Access. Production after launch: public pages 200, `/api/admin/*` 401 |

## Rules

- Write the failing test first, then the code. Run `pnpm check` after every change, and fix
  every failure before reporting back.
- Test behavior, not internals: query by role and label (`getByRole`, `getByLabelText`), not
  by CSS class.
- No shared state between tests. API tests get a fresh migrated D1 per file (the pool isolates
  storage per file, not per test; `src/test/apply-migrations.ts` applies `migrations/`). Tests
  in one file share that database: call `resetDb(env.DB)` from `src/test/reset-db.ts` in
  `beforeEach` when a test needs empty tables. A test fails if a new table is missing from it.
- **Every bug in parsing or normalization gets a fixture row** that reproduced it.
- Required API tests (do not delete):
  - Admin routes return 401 without a JWT, 401 with a bad signature/aud/expired token, 403
    for an email not in `ADMIN_EMAILS`.
  - With `SITE_MODE=private`, public routes and static assets return 401 without a JWT.
  - The dev bypass is off unless `ENVIRONMENT=development`.
  - Publishing state A never changes any row, version or mapping of state B.
  - A publish over a "confirm, typed" check fails without the typed confirmation.
  - Rollback restores the exact previous public results.
  - Public routes reject non-GET methods.

## Setup (M0 step 4)

- **Vitest 5**, one root `vitest.config.ts` with five projects: `unit` (`packages/shared`),
  `refdata` (`packages/reference-data`, parsers tested on real excerpts in its `fixtures/`),
  `component` (`apps/web`, jsdom), `api` (`apps/api`, workerd via `@cloudflare/vitest-plugin`,
  which replaced the deprecated `@cloudflare/vitest-pool-workers`), `scripts` (the repo's own
  Node scripts, e.g. `scripts/dev-stop.ts`). The plugin bundles the same
  workerd as wrangler, so tests run on the production compatibility date.
- **Component tests** use `@testing-library/vue` and `user-event`, with plain `expect` (no
  `jest-dom`: it needs `@testing-library/dom` 10, while Testing Library for Vue still uses 9).
  `src/test/setup.ts` cleans up after each test and starts an MSW 3 server with
  `onUnhandledFrame: 'error'` (MSW 3 renamed `onUnhandledRequest`), so a test that hits an
  unmocked URL fails. Test files are type-checked through `apps/web/tsconfig.vitest.json`.
- **E2E** (`apps/web/e2e/`): Playwright starts `wrangler dev` on :8788 against the production
  build. Specs fail on any console error (so a CSP violation fails), and run axe in both themes.
  First run on a new machine: `pnpm --filter @mfcd/web exec playwright install chromium`.
- **`pnpm check`** is `scripts/check.ts`, run directly by Node 26 (type stripping). Stages:
  format, lint, types, db-drift, unit, refdata, component, api, scripts; `--full` adds build, budget and e2e. `budget` (`scripts/bundle-budget.ts`, also `pnpm budget` after a build) fails when a bundle group grows past its brotli budget (about 10% over the M8 sizes) or admin code reaches the first load. `db-drift`
  (`scripts/db-drift.ts`) runs `drizzle-kit generate` and fails if it writes a file, i.e. the
  schema changed without a migration; the new migration is left in place to review. It keeps going after a
  failure so one run shows everything, and each failing line names its log file.
- **Windows, macOS and Linux** (project lead, 2026-11-03: no WSL needed). Every script runs
  `pnpm` and `node` through `scripts/lib/run.ts`, never a bare `spawnSync('pnpm', ...)`: on
  Windows `pnpm` is often `pnpm.cmd`, which Node runs only through cmd.exe, and cmd.exe cannot
  quote every string (SQL, `%VAR%`) safely. `package.json` scripts use only what cmd.exe also
  understands: `&&`, double quotes, no `FOO=bar cmd`, no `rm -rf`. Test platform logic with an
  injected platform (`scripts/lib/run.test.ts`, `scripts/dev-stop.test.ts`), since the tests
  themselves run on Linux; the `check-windows` CI job runs `pnpm check` on Windows.

### Access and site-gate tests (M0 step 5)

`apps/api/src/middleware/access.test.ts` holds the required auth tests. `src/test/access-fixtures.ts`
generates an RSA key pair per run and signs Access-style tokens (good, expired, wrong `aud`,
wrong `iss`, wrong key, no email), and builds the app with `createApp({ getJwks })` pointed at a
local key set, so no test touches the network. `call(path, { token, host, vars })` overrides any
binding; `fakeAssets` stands in for the static files. Tests that go through `exports.default`
see `SITE_MODE=public` (set in `apps/api/vitest.config.ts`).

## Fixtures

**PDF pages (M2 step 5):** `apps/web/src/ingest/fixtures/pdf-pages-<file>.json` keep only the
text runs of chosen pages, so no PDF is committed (about 180 KB in all). To rewrite them, put
the state PDFs in a folder as `ga-a.pdf`, `ga-b.pdf`, `la.pdf`, `mt.pdf`, `ne.pdf` and run
`PDF_SOURCE_DIR=<folder> pnpm test pdf-pages.make` (skipped otherwise). `fixtures/make-pdf.ts`
writes small PDFs for tests of the pdf.js side, in Vitest and e2e.

Planned for the seed lists: `fixtures/<state>/` holds, for each seed file:

- `excerpt.pdf` or `excerpt.xlsx`: a few pages that cover every quirk in `docs/sources.md`
  (wrapped descriptions, wildcards, ranges, repeated headers). These are public government
  documents, so they can live in the public repo; keep each under ~200 KB.
- `expected.json`: the normalized rows the adapter must produce.
- `seed.json`: the full normalized list, used by `pnpm db:seed:local` and E2E. Generated once
  from the real file and reviewed by hand.

## Running

Same commands in PowerShell, cmd and bash:

```text
pnpm check                    # everything except e2e, one summary line per stage
pnpm db:drift                 # only the schema-vs-migrations check
pnpm test codes               # tests whose file matches "codes" (no `--`: it disables the filter)
pnpm exec vitest run --project api   # one layer: unit | component | api
pnpm e2e                      # Playwright (builds, seeds local D1, starts wrangler dev)
pnpm e2e -- --ui              # Playwright UI mode
```

`pnpm check` prints one line per stage (`lint ok`, `types ok`, `unit 212 passed`, ...) and
writes full logs to `.logs/latest/`. Agents should read logs with `grep`/`tail`, not print them.

## Coverage

Not set up yet; add it in M1 when there is logic to measure. Use `@vitest/coverage-istanbul`
for `apps/api`: v8 coverage does not work inside workerd. Targets: `packages/shared` ≥ 95% lines, `apps/api` ≥ 85%, components
are covered by behavior tests (no number target).

## CI (GitHub Actions)

`.github/workflows/ci.yml`, on every PR and every push to `main`:

| Job | What it runs |
| --- | --- |
| `check` | `pnpm install --frozen-lockfile`, Playwright Chromium (cached by Playwright version), `pnpm check:full`. On failure, uploads `.logs/latest/` and the Playwright report as the `check-logs` artifact (kept 7 days) |
| `check-windows` | `pnpm install --frozen-lockfile` and `pnpm check` (no e2e) on `windows-latest`, so the scripts keep working without Linux. Not a required check |
| `audit` | `pnpm audit --prod --audit-level high` |
| `gitleaks` | Secret scan over the full git history |
| CodeQL | GitHub's default setup (no workflow file), JavaScript/TypeScript and Actions |

`check`, `audit`, `gitleaks` and CodeQL must pass before a PR can merge (`docs/security.md`, ruleset). A push to `main`
also deploys the preview Worker and smoke-tests it; a `v*` tag does the same for production
after approval (`deploy-preview`, `deploy-production`; `docs/deployment.md`). The deployed
Playwright smoke spec arrives with real pages (M3).
