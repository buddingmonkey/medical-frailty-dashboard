# 2026-11-02: M3 step 2, state map

**Milestone:** M3 step 2  •  **People:** none needed this step  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 13:33 CST, end 13:39 CST (`date`).

## Goal
The home page map: states coloured by status, a card with counts for the state under the
pointer or keyboard focus, and a table view of the same data.

## What happened
1. Measured first: us-atlas's pre-projected Albers file gives exactly 51 shapes (50 states and
   DC, no territories); at 0.1 px precision the paths are 109 KB (40 KB gzipped).
2. Decided to run d3-geo once at build time instead of in the browser:
   `packages/reference-data/src/us-map.ts` writes `packages/shared/src/us-map.json` (postal
   code, FIPS, name, path, centre). A test fails if the committed file drifts. The server-side
   rendering in step 4 can use the same paths.
3. Component tests first (4, all failing): a link per state named with its status, the card on
   keyboard focus, the table view, the error message. Then `StateMap`, `StateSummaryCard`,
   `StateTable` and the home page (`usePublicStates`).
4. Real browser on the four seed states, both themes: axe clean. The screenshot showed the
   focus outline vanishing on a listed state in the light theme (ring colour = fill colour);
   now a navy-and-gold double outline, checked again on Louisiana and DC.
5. New e2e: Tab moves Alabama → Alaska and shows Alaska's card; table has 51 rows; axe on the
   table. The theme a11y tests now wait for the map.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Precompute the map paths, no d3 in the browser | One 44 KB gzipped page chunk; the Worker can reuse the paths for server-rendered HTML | AI |
| Announced states are hatched, not just a different colour | Status must not depend on colour alone (WCAG 1.4.1) | AI |
| Small screens open on the table | Shapes of small states are too small to tap | AI |
| DC gets a 6 px circle | DC's shape is a few pixels wide | AI |
| Before any hover, the card shows the first state with a list | An empty card says nothing | AI |

## Corrections and surprises
- The focus outline passed every automated check (axe does not judge SVG strokes) and was
  invisible on screen. Only the screenshot caught it.

## What a non-technical builder should take from this
- Automated accessibility checks do not see everything; look at the page with the keyboard.

## Numbers
- Tests: 6 new (component 4, reference-data 2) + 1 e2e (18 total).
- Home page chunk: 117 KB (44 KB gzipped), map data included.
- AI cost: not measured. Hosting: $0.

## Open threads
- Step 3: state detail pages at `/states/:slug` (the map's links point there now).
