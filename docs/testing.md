# Testing

## Layers

| Layer | Tool | Where | What it covers |
| --- | --- | --- | --- |
| Unit | Vitest | `packages/shared/**/*.test.ts` | Code normalization, wildcard/range parsing, code-system inference, category auto-mapping, diff + checks logic. **The most important tests in the repo** |
| Parser | Vitest (jsdom/happy-dom) | `apps/web/src/ingest/**/*.test.ts` | Each adapter against `fixtures/<state>/` excerpts → expected normalized JSON |
| Component | Vitest + `@testing-library/vue` + MSW | `apps/web/src/**/*.test.ts` | User-visible behavior: pick states, see table, search results, admin review table. Mock the API with MSW, never mock composables |
| API | Vitest + `@cloudflare/vitest-pool-workers` | `apps/api/src/**/*.test.ts` | Routes running in workerd with a real local D1 and R2 (Miniflare). Auth middleware, site gate, publish/rollback, per-state write isolation |
| E2E | Playwright | `apps/web/e2e/` | Main journeys in Chromium against `wrangler dev` with seeded local D1: home map → state, compare, search → code detail, admin ingest → publish → rollback |
| Accessibility | `@axe-core/playwright` | in E2E specs | No serious/critical axe violations on every public page. State agencies often need Section 508 / WCAG 2.1 AA |
| Deployed smoke | Playwright (small spec) | CI after deploy | Preview: everything returns 401/302 without Access. Production after launch: public pages 200, `/api/admin/*` 401 |

## Rules

- Write the failing test first, then the code. Run `pnpm check` after every change, and fix
  every failure before reporting back.
- Test behavior, not internals: query by role and label (`getByRole`, `getByLabelText`), not
  by CSS class.
- No shared state between tests. API tests get a fresh migrated D1 per file (the pool does
  this with isolated storage).
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

## Fixtures

`fixtures/<state>/` holds, for each seed file:

- `excerpt.pdf` or `excerpt.xlsx`: a few pages that cover every quirk in `docs/sources.md`
  (wrapped descriptions, wildcards, ranges, repeated headers). These are public government
  documents, so they can live in the public repo; keep each under ~200 KB.
- `expected.json`: the normalized rows the adapter must produce.
- `seed.json`: the full normalized list, used by `pnpm db:seed:local` and E2E. Generated once
  from the real file and reviewed by hand.

## Running

```bash
pnpm check                    # everything except e2e, one summary line per stage
pnpm test -- codes            # tests whose name/file matches "codes"
pnpm --filter api test        # one workspace
pnpm e2e                      # Playwright (builds, seeds local D1, starts wrangler dev)
pnpm e2e -- --ui              # Playwright UI mode
```

`pnpm check` prints one line per stage (`lint ok`, `types ok`, `unit 212 passed`, ...) and
writes full logs to `.logs/latest/`. Agents should read logs with `grep`/`tail`, not print them.

## Coverage

`pnpm coverage` (v8). Targets: `packages/shared` ≥ 95% lines, `apps/api` ≥ 85%, components
are covered by behavior tests (no number target).

## CI (GitHub Actions)

- PR: `pnpm check:full` (lint, types, unit/component/API, build, Playwright + axe), CodeQL,
  gitleaks, `pnpm audit --prod`.
- `main`: same, then deploy (see `docs/deployment.md`), then the deployed smoke spec.
