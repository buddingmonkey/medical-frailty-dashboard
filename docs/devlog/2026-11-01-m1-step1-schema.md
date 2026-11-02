# 2026-11-01: M1 step 1, database schema and first migrations

**Milestone:** M1 step 1  •  **People:** project lead  •  **AI:** Claude Code, Opus main session
(no builder agent)

Start 20:58 CST, end 21:10 CST (from the PC clock).

## Goal
Every table in `docs/data-model.md` as a Drizzle schema with SQL migrations, the FTS5 search
table, and the SEO fields from the roadmap (state slug, the state's publish date, our
last-updated date).

## What happened
1. The AI read the roadmap step and data model, checked versions on npm (stable
   `drizzle-orm` 0.45.4 and `drizzle-kit` 0.31.11; 1.0 is still an RC) and checked
   Cloudflare's docs on D1 export.
2. It presented a plan with four problems and four questions. The project lead approved all
   four recommendations: Time Travel instead of `d1 export` for pre-deploy backups, computed
   code URLs, integer IDs with ISO-8601 text dates, and a schema drift check.
3. Test first: shared enums (`packages/shared/src/enums.ts`), then 11 database tests that ran
   red ("no such table"), then the schema, then the migrations. The FTS5 table and its
   triggers are a hand-written migration because drizzle-kit cannot generate virtual tables.
4. `pnpm db:migrate:local` applied both migrations through wrangler, triggers included.
5. Added `scripts/db-drift.ts` as a `pnpm check` stage (0.5 s). Its first self-test was
   invalid (the edit to the schema did not apply). The second, with a real extra column,
   failed as it should.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Pre-deploy backup = D1 Time Travel bookmark, not `wrangler d1 export` | Export refuses databases with virtual tables; dropping FTS for each deploy empties search | Project lead, on AI recommendation |
| Code page URLs are computed (`/codes/icd-10-cm/F20.0`), no slug column | Codes have no table of their own; one function keeps them stable | Project lead, on AI recommendation |
| Integer IDs, ISO-8601 text dates | Readable in exports and the D1 console | Project lead, on AI recommendation |
| Schema drift check in `pnpm check` | Catches a schema edit without a migration; costs 0.5 s | Project lead, on AI recommendation (planned for CI only; it was fast enough for every run) |
| `state_subcategory` is `''`, not NULL | SQLite treats NULLs as distinct, so a unique key with a NULL column lets duplicates through | AI, in the approved plan |
| At most one published version per state, enforced by a partial unique index | A bug in publish cannot leave two lists live | AI |

## Corrections and surprises
- **The docs planned a backup the platform cannot make.** `docs/deployment.md` and the roadmap
  said "D1 export to R2 before production migrations". Cloudflare's docs say export refuses any
  database with a virtual table, and full-text search needs one. Found while planning, before
  any deploy code.
- **`docs/testing.md` was right, but easy to misread.** Test storage is isolated per *file*, not
  per test, so the first green-looking test run failed on duplicate rows. Added `resetDb()` and
  a test that fails if a new table is missing from it.
- **A self-test that tested nothing.** The first drift-check trial used a search-and-replace
  that matched no line, so "no drift" proved nothing. The AI noticed the edit had not applied
  and repeated the trial properly.
- **Open:** `docs/seo.md` shows state URLs as `/states/ga`; the plan's example slug was
  `louisiana`. The `slug` column supports either; the project lead picks before seeding.

## What a non-technical builder should take from this
- Ask the AI to check the platform's limits for each plan step against its official docs. A
  backup plan that cannot run is worse than none, because you rely on it.
- When you test a safety check, first confirm that you really broke something. A check that
  passes on a broken test proves nothing.

## Numbers
- Time: about 12 minutes from start to PR.
- AI cost: not measured. Hosting: $0 (local only; no deploy in this step).
- Code: about 1,100 lines of schema, SQL, tests and scripts, plus drizzle-kit's generated
  snapshot JSON (about 2,200 lines).
- Tests: 54 API (13 new), 15 unit (10 new), 6 component, 5 e2e; all passing.

## Open threads
- State URL slug: `/states/ga` (as in `docs/seo.md`) or `/states/georgia`.
- M1 step 2: `codes.ts`, including the code URL function.
- M1 step 6: record the Time Travel bookmark in `deploy.yml`, then migrate.
