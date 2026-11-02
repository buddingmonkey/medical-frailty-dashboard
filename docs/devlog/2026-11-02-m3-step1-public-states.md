# 2026-11-02: M3 step 1, public states API

**Milestone:** M3 step 1  •  **People:** project lead (gave the go for M3)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 13:25 CST, end 13:30 CST (`date`).

## Goal
`GET /api/public/states`, the data behind the home map, cached at the edge on
`data_version`.

## What happened
1. Shared schema first (`packages/shared/src/public.ts`): each state, and for a published list
   its version, source date, last update, entry counts by code system, federal category and
   qualification (a key for every value, zeros included), and `mappingsConfirmed`.
2. API tests first (6), all failing before the route existed: drafts never count, a chapter
   override beats the category mapping, an auto guess counts but leaves the state unconfirmed,
   the version's own date beats the source's, cache hit until `data_version` moves, private
   mode never stores or serves from the shared cache, private mode needs a sign-in.
3. `publicCache` middleware (`apps/api/src/middleware/public-cache.ts`) and the route: five
   queries over all states at once, counts grouped in SQL by state, system, category,
   qualification and 3-character ICD-10-CM category (enough to find the chapter).
4. Local check on the real seed data: 51 states, four published, 68 ms uncached.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Counts are entries, not codes | A wildcard entry covers many codes; the page will say "entries" | AI |
| Auto (keyword) mappings count in the public totals, with `mappingsConfirmed: false` | Same rule as the admin (`federalCategoryOf`); the launch gate needs confirmed mappings anyway | AI |
| Private mode: `Cache-Control: private, no-store` | Never keep a signed-in response anywhere shared | AI (from `docs/architecture.md`) |

## Corrections and surprises
- The first green run had one failure: the tests shared a cache key (same host, `data_version`
  0 after each reset), so one test read another's cached answer. Each call now gets its own
  host. The same thing cannot happen in production because `data_version` only goes up.
- The Cache API does nothing on `*.workers.dev`, so the cache only helps once there is a
  custom domain (M7). Recorded in `docs/architecture.md`, "Caching".

## What a non-technical builder should take from this
- A cache is a second copy of the truth; test that it gets thrown away when the truth changes.

## Numbers
- Tests: 8 new Vitest (API 6, shared 2).
- AI cost: not measured. Hosting: $0.

## Open threads
- Step 2: the map (`StateMap`, d3-geo) on top of this endpoint.
