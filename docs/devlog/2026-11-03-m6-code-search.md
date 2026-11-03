# 2026-11-03: M6 code search

**Milestone:** M6  •  **People:** project lead  •  **AI:** Claude Code, Opus 5.5 main session
(the lead) + Opus builders in worktrees; a Fable text reviewer, an Opus playbook reviewer and a
Sonnet docs builder

## Goal
Search for a code by number or words, and a page per code that shows every state's status.

## What happened
1. 10:28 CST: `v0.6.0` was approved by the project lead and deployed by CI (run 41673703422).
   The lead checked production in the project lead's signed-in Chrome. All compare tabs serve,
   `/?category=x` redirects to the Map tab, and there is no banner. The Overview says "No
   categories are published yet", because the 19 starter categories are still drafts on
   production.
2. 10:31: the project lead said "start M6". The lead planned three waves: steps 1 and 3 in
   parallel, then 2 and 4, then 5.
3. The project lead decided that search indexes every ICD-10-CM and HCPCS reference
   description, not only listed codes (see Decisions).
4. The project lead asked for two reviews while the builders ran. A Fable agent reviewed all
   public text for a Medicaid agency reader (38 main findings). An Opus agent rewrote the
   playbook for a contributor who has never used a terminal. Both became steps: **3b**, a
   plain-language pass that applies every finding and keeps the legal list current, and
   **3c**, the contributor docs, checked by running the setup in a fresh clone.
5. **Step 3 (code detail)** (10:32–10:46, builder): `GET /api/public/codes/:system/:code`
   reuses the drill-down's matcher (`shared()` in `public-drill.ts`) with the code as its one
   row, in 5 queries. The page `/codes/<system>/<code>` shows "Confirmed" (listed, covered),
   then the other statuses, with a sentence explaining each. A code that CMS doesn't know and no
   state lists answers 404.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Search indexes all ~107k reference descriptions (ICD-10-CM, HCPCS; never CPT) | A word search must find codes no state lists, so the site can say "no state lists this". One-time writes are $0 on Workers Paid | Project lead |
| Text fixes become M6 step 3b and apply every finding; the legal list keeps each item, with the new wording | Clear text now; the lawyers still decide | Project lead |
| Contributor docs become M6 step 3c | A non-technical employee goes from the GitHub page to a PR | Project lead |

## Corrections and surprises
- The step 3 brief said other public routes respect `show_qualification`. None do yet; the code
  detail route reads it itself. A setting change shows up within 5 minutes, not at once.
- Step 3's tests passed on their first run. The lead broke the status logic on purpose, and
  2 of 4 loader tests failed, as they should.

## What a non-technical builder should take from this
- Ask the AI to show that a test can fail. A test that has never failed may not test anything.

## Numbers
- Step 3: 15 files, +1,214 lines; 25 new tests. `check:full`: 524 unit, 227 component,
  315 API, 53 e2e.

## Open threads
- Should the SPA redirect non-canonical code URLs (`/codes/icd-10-cm/f200`)? Step 5 decides,
  with server rendering.
- An entry "F20 with children" shows as "covered" on F20's page, as in M4.
