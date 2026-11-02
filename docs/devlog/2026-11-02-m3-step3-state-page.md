# 2026-11-02: M3 step 3, state pages

**Milestone:** M3 step 3  •  **People:** none needed this step  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 13:48 CST, end 13:53 CST (`date`).

## Goal
A page per state at `/states/:slug`: summary, sources with links and dates, version history,
notes. The map links there.

## What happened
1. Moved the counting out of the list route into `publicSummaries()`
   (`apps/api/src/db/public-summary.ts`), with an optional state filter and per-category
   rows. The list route's 6 tests passed unchanged after the move.
2. API tests first (7 new): summary, sources, versions (published and replaced, never a draft),
   categories split by federal category where a chapter override applies, a state with no list,
   404s (bad slug, unknown state; never cached), and a `javascript:` source URL shown as
   unknown. Deliberate break: returning stored URLs as they are failed that test.
3. Page tests first (3), then `pages/states/[slug].vue`: three summary figures, count tables
   (code system, federal category, qualification), the categories table with "Confirmed" /
   "Not yet confirmed", sources (external links open in a new tab, `noopener`), version
   history, notes through the text-only Markdown view.
4. e2e: clicking Alabama on the map opens its page (axe clean); an unknown state shows
   "State not found".
5. Real browser, Louisiana with real data, light and dark: axe clean. The screenshot showed
   the third count table stretched to its neighbours' height; fixed.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| A category split across federal categories shows one row per federal category | A chapter override can send part of a category elsewhere; one row would hide it | AI |
| Source URLs that are not http(s) are shown as "link not known" | The page must never render a `javascript:` link, whatever is in the database | AI |
| Explain "entry" on the page | Counts are lines of the list, not codes; a wildcard line covers many codes | AI |

## Corrections and surprises
- My test fixture used version number 0 and the API refused it with a 500: the response schema
  is stricter than the database. Fixed the fixture (a rolled-back v3).

## What a non-technical builder should take from this
- Move shared logic first and run the old tests before adding anything new; then a failure
  means the move broke something, not the new feature.

## Numbers
- Tests: 10 new Vitest (API 7, component 3) + 2 e2e (20 total).
- AI cost: not measured. Hosting: $0.

## Open threads
- Step 4: server-rendered HTML, JSON-LD, downloads and the sitemap. The page has no list of
  codes yet; that comes with compare and search (M4, M5) and the downloads (step 4).
