# 2026-11-13: Indiana's Tier 1 list, from a web page

**Milestone:** M8 (alongside launch work)  •  **People:** project lead, an advocate (sent the
link)  •  **AI:** Claude Code, Opus main session, no agents

Start 16:49 CST, end 20:45 CST (`date`; includes a wait while the project lead loaded
production).

## Goal
An advocate sent Indiana's new medical frailty page. Find out whether the admin screens can
ingest it or whether it needs the AI cleanup flow, and load the Tier 1 codes to see how they look.

## What happened
1. The page (FSSA, HIP work requirements) has three tiers. Only Tier 1 has codes, as 21 HTML
   tables, one per ICD-10 chapter. Tier 2 is a diagnosis **plus** utilization evidence, and the
   state publishes no utilization codes. Tier 3 is clinical review.
2. A short script turned the tables into a CSV: 4,250 unique codes with 4 columns. The
   upload does not take HTML.
3. The AI first printed the page to PDF, to use as the stored evidence file. The project lead
   asked why PDF rather than CSV, since PDF is more error-prone. The AI switched to the CSV.
4. Claude in Chrome could not reach `localhost` (the browser runs on another machine). The AI
   drove the local admin screens with one-shot Playwright scripts instead. An attempt at a
   local "eval anything" server for the browser was blocked by the permission classifier, and
   that was the right call.
5. Read and map, review, draft and publish ran locally with no code changes: 127 decisions
   made in two bulk actions, 4,250 of 4,250 rows ready, all 12 checks passed.
6. The project lead loaded the same CSV on production through the admin screens.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Store the CSV made from the page's tables, not a PDF print | The table-to-CSV step needs no guessing. A PDF needs its layout rebuilt | Project lead |
| Load Tier 1 only | Tier 2 has no published codes | Project lead |
| Category = "High-level condition" (159 values), state's federal category kept in notes | Keeps the state's own grouping; the site has no field for a state-given federal category | AI, for review |
| Tier 1 = "Enough by itself", stated by the state | The page says Tier 1 diagnoses "may qualify independently" | AI, for review (legal list applies) |
| Bare 3-character codes = "this code only" | The page says inclusion is code-specific. All 28 have no children, so the result is the same | AI |

## Corrections and surprises
- The page's own index says 4,288 codes (F chapter 430, R chapter 121). Its tables hold 4,250
  (F 393, R 120). Checked against the raw HTML.
- 99 undotted ICD codes (`C9021`) are also valid HCPCS shapes, so review asks which system each
  one is. The bulk "Code system for the rows shown" control answered them in one step.
- The AI's first choice (PDF as evidence) was the more error-prone path. The project lead
  caught it.

## What a non-technical builder should take from this
- When a state posts its list as a web page table, save it as a CSV and upload that. You do
  not need the AI helper.
- Before you publish, compare the counts the state prints with the counts in its tables.

## Numbers
- 4,250 entries, 159 state categories, 0 rows that cannot be read, 0 codes outside the CMS
  lists.
- After publishing: 2,319 entries "Not yet classified" for federal category.
- AI cost: not measured. Hosting cost: none added.

## Open threads
- Map Indiana's categories on production.
- Product decision: read the state's own federal category column?
- Product and legal decision: how to show a Tier 2 that has no published codes.
