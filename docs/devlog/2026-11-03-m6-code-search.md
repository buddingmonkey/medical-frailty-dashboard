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

## Step 3c: contributor docs (10:45–11:05)
- New `docs/getting-started.md`, which takes someone from the GitHub page to an open PR:
  accounts, WSL 2 on Windows (required: the scripts call `ps`, `ss` and bash), each install
  with a check that it worked, fork and clone, the local database, `pnpm dev`, the first
  Claude Code session, and troubleshooting. `docs/playbook.md` was rewritten for a reader who
  has never used a terminal and gained a glossary.
- A Sonnet builder ran the setup in a fresh clone. `pnpm install` took 10 s,
  `db:ref:local` 77 s (the docs said ~20 s; fixed) and `db:seed:local` 7 s. `pnpm dev`
  served both `/` and `/admin/unified`. The GitHub sign-in, fork and Claude Code install
  steps were not run, because they act on a real account.
- 9 of the review's 11 contradictions between README, CONTRIBUTING and CLAUDE.md were fixed.
- `.gitattributes` forces LF. The first version would have rewritten three CRLF fixtures that
  the CMS/AHRQ parser tests depend on. The lead caught this when renormalizing, and those
  fixtures are now `-text`.

## Step 1: search endpoint (10:34–11:02 builder; lead review to 11:15)
- `GET /api/public/codes/search?q=&states=&system=&limit=`. A code number (`F20`, `f20.0`,
  `J1234`) prefix-matches through the normal indexes, with the exact code first. Words go to
  FTS5 over both state entries and the new `ref_codes_fts` (migration 0012: ICD-10-CM and
  HCPCS descriptions, never CPT). Every token is quoted, and the last one is a prefix for
  type-ahead. Two D1 round trips; lists are bound with `json_each`, far below 100 parameters.
- Measured locally: the backfill of 107,173 rows took ~2 s and added ~219k FTS rows; the
  database grew from 17 to 43 MB. A search for "disorder*" returned 2,157 matches in 4 ms.
- The lead added porter stemming to `ref_codes_fts` before the migration ran anywhere, so
  "disorders" finds "disorder", and added a test that fails without it. `entries_fts` (0001)
  is unchanged: changing it means rebuilding an applied table.

### Corrections and surprises
- Ranking: bm25 scores from two indexes are not comparable; F20.9 ranked above F20. Fix: when
  a code has CMS text, the CMS score wins.
- `ORDER BY e.id` made SQLite read every row of `entries`. A test on the query plan caught
  it, and `INDEXED BY entries_code_idx` fixed it.
- Numbers: 17 files, about 3.2k lines (2k of them drizzle's snapshot); 86 new tests.
  `check:full`: 562 unit, 363 API, 53 e2e.

## Step 2: search page (11:11–11:22 builder)
- `/search`: one search box, a code system filter, and checkboxes for states that have a list.
  Results appear 250 ms after typing stops. Each query has its own cache key and an abort
  signal, so a slow old answer never replaces a newer one (tested). The URL holds the search.
  A polite live region announces only the count. Search joined the site menu.
- `noindex` is set in the page only. A server-side `X-Robots-Tag` for `/search` goes with
  step 5, which owns server rendering.
- `check:full`: 55 e2e tests, including the new one (type, see results, open a code page,
  axe in both themes).

## Step 3b: plain-language pass (10:53–11:25 builder; lead merge to 11:45)
- The text review's findings were applied to every public page: 52 of 58 in full, 3 in part
  and 3 on purpose not at all; the reasons are in the branch's status bullet.
  - "Cover" and "qualifies" now describe what a list includes, never a member's eligibility.
    "Qualifies alone" is now "Enough by itself", under the heading "State's rule".
  - Numbers say what they count; for example, the overview share counts diagnosis codes
    only.
  - A footer disclaimer was added. One name is used for each idea.
  - The new code page says "Included" and "Not included".
- Migration 0013 rewords the 19 starter categories. A field changes only while it still
  holds 0011's exact text, so the project lead's edits on production are kept (tested).
- Every reworded legal-list item stays on the list, with the new wording and
  "(reworded 2026-11-03)". The "learn more" places that wait for the About/methodology page
  (M8 step 4) are listed in `docs/status.md`.

### Corrections and surprises
- The builder updated the e2e tests' strings but could not run them (builders skip
  `check:full`). At the merge, 11 failed, all because of old strings, not broken pages. The
  lead read the real names from Playwright's page snapshots and fixed the 6 files.
- Merging step 2 and 3b clashed on the one-line legal list row. The lead kept both.
- Migration 0013 had no drizzle journal entry. The lead added it, with a copy of 0012's
  snapshot, and `db:generate` confirmed no drift.
- Numbers: 70 files, +1,600/−596. `check:full`: 583 unit, 238 component, 365 API, 55 e2e.

## Step 4: condition groups and like codes (11:07–11:32 builder; lead merge to 11:55)
- Migration 0014 rebuilds the empty `condition_groups` table to add a definition, sources and
  draft/published status. It seeds eight **draft** groups: cancer and chemotherapy, kidney
  failure and dialysis, organ transplant, HIV, serious mental illness, substance use,
  hemophilia and multiple sclerosis. Every ICD-10-CM and HCPCS member was checked against
  `ref_codes`. The CPT ranges are numbers only and still need a human check before publishing.
- Admin at `/admin/condition-groups`. Every change writes an audit row and bumps
  `data_version` in the same batch.
- Code page: `likeCodes` sits next to each state's real status, in its own "Like codes"
  section. A like code never becomes a status, so it can't look like a match. Only
  published groups count, so nothing shows publicly yet.

### Corrections and surprises
- drizzle-kit's rebuild SQL had two bugs. Its INSERT selected columns the old table didn't
  have, and its CHECK named the temporary table, which plain SQLite rejects after the rename
  (Miniflare accepted it). The builder fixed both by hand. Lesson: read the generated SQL.
- Three migrations were made at the same time (0012, 0013, 0014). The lead put the drizzle
  journal and the snapshots' `prevId` chain back in order at each merge, and `db:generate`
  confirmed no drift.
- Numbers: 60 new tests. `check:full`: 620+ unit, 378+ API, 55 e2e (all passed).
