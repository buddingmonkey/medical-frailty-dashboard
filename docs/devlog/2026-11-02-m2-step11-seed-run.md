# 2026-11-02: M2 step 11, the four seed states and a wrong file

**Milestone:** M2 step 11  •  **People:** project lead (needed for the preview half)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 10:08 CST, end 10:14 CST (`date`).

## Goal
Load all four seed states through the UI and confirm that a wrong file (Nebraska's list loaded
as Montana) is stopped by the typed-confirm checks.

## What happened
1. Planning the run found a gap: Georgia publishes each tier as its own file, but the mapping
   screen could set a category for every row and not a tier. Added "Tier for every row" to the
   column profile (test first).
2. A Playwright script drove the real UI on `pnpm dev` with a fresh local database and the real
   reference codes: store each source (title, URL, date), read it, map columns, answer the
   review's questions in bulk, send to a draft, run the checks, publish with every confirmation.
   Two first attempts failed on my own script's selectors, not on the site.
3. Results (browser time 38 s for everything):

   | State | Rows read | Decisions | Published codes |
   | --- | --- | --- | --- |
   | GA (A + B) | 1,686 + 4,487 | 74 + 122 | 6,046 ICD-10-CM (126 duplicates merged) |
   | LA | 2,526 | 237 | 950 ICD, 744 CPT, 509 HCPCS, 135 revenue, 85 drug class |
   | MT | 314 | 37 | 309 ICD (3 truncated ranges counted invalid, under 2%) |
   | NE (2 tables) | 8,146 + 27 | 102 | 8,146 ICD, 28 CPT, 8 HCPCS |

4. Wrong file: Nebraska's PDF as Montana. The checks asked for the state code typed twice ("The
   file names NE, but this draft is for MT"; "137 of 309 published codes (44.3%) are gone, and
   the row count changes from 311 to 8,146") and a tick for 30+ missing categories. Publish
   stayed disabled with every box ticked and "NE" typed. The draft was discarded.
5. LA's drug classes: the "Not in the CMS lists" filter plus each Pharmacy category, then "Set
   code system: Drug class", 85 rows in 8 groups.

## Preview half (10:55–11:09 CST)
The project lead signed in to preview in a Chrome window; the session drove it with the
browser tool. Files from `~/Downloads` needed `/add-dir` first (the tool uploads only files the
session may read). Same steps, same numbers: MT 309 codes, NE 8,182 (two parts), GA 6,046 (A +
B), LA 2,423 (85 drug classes set by a short script using the page's own controls). Wrong file:
both typed checks fired; publish disabled with "NE" typed; a direct API call with "NE" got 400
(`missing: state_mismatch, large_change`). Discarded; MT stayed at v1.
`wrangler d1 insights` on preview: 109,486 rows written by 25,338 entry inserts, 4.3 per entry.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| "Tier for every row" in the column profile | GA's tiers are separate files | AI |
| Run on local dev, preview left to the project lead | Preview is behind the project lead's Access login; admin routes need an `ADMIN_EMAILS` identity | AI |
| Assumptions for the run (scope of bare categories, qualification per state) | Needed to finish a run; listed in `docs/status.md` for the project lead to confirm or change | AI (provisional) |

## Corrections and surprises
- None in the site during the run. The milestone check passed on the first full attempt after
  the tier fix.

## What a non-technical builder should take from this
- Rehearse the whole job on your own computer with the real files before doing it on the live
  system; it took under a minute here and found one missing field.

## Numbers
- 4 states, 6 files, 17,186 rows read, 16,960 distinct codes published (the diff's "added"
  counts), 38 s of browser time.
- AI cost: not measured. Hosting: $0 (local).

## Open threads
- Category mappings: none confirmed yet.
