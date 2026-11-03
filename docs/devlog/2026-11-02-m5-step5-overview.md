# 2026-11-02: M5 step 5, overview matrix

**Milestone:** M5 step 5  •  **People:** project lead (answered four open questions)  •
**AI:** Claude Code, Opus main session (brief, review) and one builder agent (Opus)

Start 18:03 CST, end 18:25 CST (`date`). Builder: 18:04–18:24.

## Goal
"Which states cover what": every state and DC against every published unified category, at
`/compare`, server-rendered and indexable.

## What happened
1. `/compare` is now the overview; the M4 table moved to `/compare/codes` (and its CSV); old
   links with a query answer 301. The slug `codes` is reserved.
2. `OverviewMatrix.vue`: two-row header (federal group, then category), a number and a shade in
   every cell, "none listed" hatched, "no list yet" rows, sort by any column (`aria-sort`, live
   announcement), order by name, overall or "similar states together" (seriation), sticky header
   and first column, a "not reviewed" mark. Shared helpers give the Vue page and the server HTML
   the same words and numbers.
3. Screenshots with real data (four seed states, six local test categories) found a short table
   box, a gap above the table, a wide state column on phones, and one wrong label: Louisiana's
   opioid cell has entries that cover none of the category's codes, yet said "none listed". Fixed.
4. Deliberate break: moving the top shade threshold failed a test.

## Project lead's answers (2026-11-02)
| Question | Answer |
| --- | --- |
| Workers plan | Stay on Workers Paid; the 2026-11-30 downgrade is dropped |
| Federal category | Pre-mapped: each unified category has a fixed federal parent; admins manage only state → unified. A code's federal category follows its unified categories (a code in two counts under both); the M2 federal mapping becomes the fallback |
| Retire a never-published draft | Yes |
| Rebuild placements on a new CCSR or ICD-10-CM release | Yes |

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Shade tokens from the approved mockup (AA in both themes) | The project lead approved the mockup | AI, from the mockup |
| Overall = plain average of category shares | Big categories (cancer) would otherwise dominate | AI (builder), accepted |

## Corrections and surprises
- The admin sources list breaks D1's 100-parameter limit past 100 source files for a state
  (`inArray` over ids); the persisted admin e2e database showed it. Fix in the follow-up step.
- Prettier rewrites `html` templates and can put whitespace inside `<a>`; keep small fragments
  on one line.

## Numbers
- Tests: unit 456 (+25), component 169 (+8), API 225 (+5), e2e 39 (+5).
- AI cost: not measured. Hosting: $0 (Workers Paid, $5/month, kept).

## Open threads
- Follow-up step: federal category from unified categories, retiring drafts, the sources
  limit, the sort order in the URL.
- Legal list: the overview's public wording.
