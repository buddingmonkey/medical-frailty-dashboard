# 2026-11-02: M5 step 8, tile map

**Milestone:** M5 step 8  •  **People:** none needed this step  •
**AI:** Claude Code, Opus main session (brief, review) and one builder agent (Opus)

Start 20:18 CST, end 20:35 CST (`date`). Builder: 20:19–20:34.

## What happened
1. "One category across the country" on the home page (only when a unified category is
   published): 51 equal tiles on an 11 × 8 grid (layout in `packages/shared/src/tile-map.ts`,
   tested: every state and DC once, no shared cell), the overview's shades and words, a category
   picker (`?category=`), tiles linking to the drill-down, "Show as a table". Screen readers get
   the tiles in name order; CSS grid places them. Reuses `/api/public/overview`.
2. Server HTML: a table for the chosen category and a GET form, so it works without JavaScript.
3. axe's label-in-name rule failed tiles showing "MT" with a name spelling out Montana; now only
   the number is the link text. Phone text raised to ~10 px. Deliberate break: unsorted tiles
   failed 2 tests.

## Open threads (for the M5 review)
- Dark mode: the "1–24%" and "no list" shades are nearly the same colour (text still differs).
- MSW does not fail tests on an unmocked request (`onUnhandledFrame` covers WebSocket frames only);
  set `onUnhandledRequest: 'error'` and fix what it finds.
- With only 4 states listed, the table is mostly "No list on this site yet" rows.

## Numbers
- Tests: unit 508, component 197, API 282, e2e 52. AI cost: not measured. Hosting: Workers Paid.
