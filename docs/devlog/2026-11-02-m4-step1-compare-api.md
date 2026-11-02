# 2026-11-02: M4 step 1, compare API

**Milestone:** M4 step 1  •  **People:** project lead (go-ahead for M4)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 14:57 CST, end 15:08 CST (`date`).

## Goal
`GET /api/public/compare`: one category's codes, aligned across any number of states, for the
compare page (step 2).

## What happened
1. Shared first (`packages/shared/src/compare.ts`, 17 tests): the URL query
   (`compareQuerySchema`: states in column order, a federal category or one state's own
   category, code system, "qualifies alone", page; `compareSearchParams` writes it back with
   defaults left out), `displayEntryCode` (`F10.*`, `F41.*–F42.*`), and `buildCompare`, a pure
   function that makes the rows and one cell per state: listed, covered by a broader entry,
   narrower codes listed, not listed, or no list.
2. API tests (5), then `apps/api/src/db/public-compare.ts` and the route behind
   `publicCache`. Descriptions: CMS text for ICD-10-CM and HCPCS rows; otherwise the first
   column state's own published text, named as the source (never an AMA table).
3. Deliberate breaks. Removing the guard "a single code never covers a wildcard" failed
   nothing: the guard was dead code, because single codes never enter the wildcard index.
   Removed it; putting single codes into that index then failed the test. Skipping the CMS
   descriptions failed the API test.
4. Real data on `pnpm dev` (GA, LA, MT, NE, 17,027 entries): the worst case, every
   unclassified entry of all four states, is 8,764 rows (88 pages), about 170 ms per request
   locally, D1 included.
5. CPU: the Free plan allows 10 ms of CPU per request. The first version spent ~40 ms of
   JavaScript per page on that worst case and loaded every description (8 MB). Now descriptions
   are read only for the 100 rows shown, each entry's key is built once, rows sort on string
   keys, and the "narrower" index is built only when needed: ~20 ms in Node, noisy. Real Worker
   CPU will be read from Workers Logs on preview.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| A cell looks through the state's whole list, not just the chosen category, and shows the category it found the code under | GA and NE have no categories ("(no category)"); comparing only within a category would call their codes "not listed" | AI |
| Add "narrower codes listed" beside the roadmap's three statuses | A state that lists `F10.20` but not `F10.*` is not "not listed"; `docs/data-model.md` already defines the word | AI |
| "Qualifies alone" keeps rows that qualify alone in at least one selected state; cells still show each state's own badge | Shows where states disagree, which is the point of comparing | AI |
| Pages of 100 rows on the server; CSV (step 2) gets every row | Keeps each response small and inside the Free plan's CPU | AI |
| Unknown state codes answer 400, not an empty column | A typo in a shared link should say so | AI |

## Corrections and surprises
- A deliberate break that failed nothing found dead code, not a missing test.
- `includes_children` is a number in D1 but `0 | 1 | null` in the shared types; the loader
  narrows it.

## What a non-technical builder should take from this
- If breaking a rule on purpose fails no test, either the test is missing or the rule does
  nothing. Find out which.

## Numbers
- Tests: 22 new Vitest (shared 17, API 5).
- AI cost: not measured. Hosting: $0.

## Open threads
- Step 2: the compare page, CSV export, server-rendered `noindex` HTML.
- Read the compare route's CPU time on preview before the Workers Paid month ends (2026-11-30).
