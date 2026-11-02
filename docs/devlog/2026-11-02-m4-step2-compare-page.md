# 2026-11-02: M4 step 2, compare page

**Milestone:** M4 step 2  •  **People:** none needed this step  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 15:12 CST, end 15:27 CST (`date`).

## Goal
The compare page: pick a federal category (or one state's own category), a code system and
any number of states; read an aligned table with each state's tier and qualification badge;
filter to "qualifies alone"; share the URL; download CSV. Server-rendered, `noindex`.

## What happened
1. Shared wording first (`compareCellText`, `compareQualificationText`, `compareFiledUnder`,
   `compareSubject`, `stateCategoryName`; 3 tests), so the Vue table, the server HTML and the
   CSV say the same words.
2. Page tests first (7, MSW), then `pages/compare.vue` with `CompareControls`,
   `CompareTable` and `QualificationBadge`. The URL is the state: the controls write a complete
   selection to it (page back to 1), and a shared link or the back button writes it back into the
   controls. `keepPreviousData` keeps the table on screen while the next page loads.
3. "Compare" in the header, and a "Compare" link on every category row of a state page (that
   state's own category, the state as the first column).
4. Server side (5 tests): `/compare` rendered into `index.html` (always `noindex`, canonical
   `/compare`), and `/compare.csv` with every row and a column group per state.
5. e2e (4): the journey with axe, the shared link in a new tab, a state page's link, the CSV,
   and the page with JavaScript off.
6. Deliberate break: making `/compare` indexable failed 2 tests.
7. Real data on `pnpm dev` (GA, LA, MT, NE; "Serious or complex medical condition": 1,203
   rows, 13 pages), light and dark, desktop and phone: axe clean, no console errors. The
   screenshot showed the code column wrapping "ICD-10-CM"; fixed.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Changes apply at once; no "Compare" button | Fewer steps; the URL updates as you go, so any moment's view can be shared | AI |
| Only states with a list can be ticked; a link may still name others (they show "No list on this site") | Ticking a state with no list adds an empty column | AI |
| Code pages are not linked yet | They arrive in M5; a link now would 404 | AI |
| The CSV writes each state's text labels ("Qualifies alone", "The state says so") | Readable in a spreadsheet without a key; the state downloads already do the same | AI |
| Selects get an explicit `<label for>` | Chromium named a select wrapped in its label "Federal category Serious or complex …"; the e2e caught it, jsdom did not | AI |

## Corrections and surprises
- Two e2e failures were mine: a CSV cell with a comma is quoted, and "Federal category" also
  matched the radio "A federal category in the law".
- A select inside its `<label>` gets the selected option in its accessible name in Chromium,
  but not in jsdom.

## What a non-technical builder should take from this
- Put every choice in the URL. Sharing, the back button and server rendering then work for
  free, and the tests can start from any state by visiting a link.

## Numbers
- Tests: 15 new Vitest (shared 3, component 8, API 5) + 4 e2e. Totals: 695 Vitest + 28 e2e.
- AI cost: not measured. Hosting: $0.

## Open threads
- CPU time of `/api/public/compare` on preview (Workers Logs) before the Free plan returns on
  2026-11-30.
- On a phone the header (title, two links, theme menu) is tight; revisit in M7's polish.
