# 2026-11-02: M2 step 6, review table

**Milestone:** M2 step 6  •  **People:** project lead (none needed this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 08:03 CST, end 08:19 CST (`date`).

## Goal
Show every mapped row with its flags before it goes to a draft: inline edits, drops, accepted
flags.

## What happened
1. Shared logic first, test first: `packages/shared/src/review.ts` (`buildReview`,
   `codeSystemFromText`, `guessUndottedIcd`) runs `parseCodeCell` on each row with the
   admin's edits and sorts rows into Ready / Needs a decision / Cannot be read / Dropped.
   Flags that need a choice get buttons (whole category or this code only; ICD-10-CM or
   HCPCS); the others get Accept.
2. `ReviewTable.vue` (edits as a `defineModel`, so step 7 can send them): filters, search,
   pages of 50, inline edit form, drop/restore, bulk actions on the rows shown.
3. Hands-on with all four seed states' full PDFs in a real browser: 1–1.7 s to read and review,
   about 70 ms per bulk action on NE's 8,146 rows. It also showed two gaps no test had: NE
   had 1,602 "ICD-10-CM or HCPCS?" questions, with real HCPCS codes from page 295 mixed in (a
   bulk "ICD-10-CM" would have mislabelled them), and LA's drug classes (`H2G`) read as ICD-10-CM
   categories.
4. Fix for both: look every exact code up in the CMS lists already in D1
   (`POST /api/admin/ref-codes/lookup`, 1,000 codes per request, 100 per D1 query). Only one
   list has the code → the question is settled; neither has it → a "Not in the CMS lists"
   note and filter. NE: 1,602 open questions → 102.
5. Loading the reference codes for that check found a bug from M1 step 6:
   `pnpm db:ref:local` refused every local load (`Number.isFinite(Infinity)` is false). Fixed
   with a test.
6. Deliberate breaks: a missing line-break flag (1 unit test failed), bulk scope applied to
   every row (passed at first: the default filter hid the difference; the test was
   tightened, then failed as it should), lookups not cached (1 page test failed).

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Category scope and code-system ambiguity are answered, not "accepted" | Each needs a value (`includes_children`, a system), not a tick | AI |
| Wildcards, duplicates and "not in CMS" are notes, never blockers | Duplicates merge in the draft; unknown codes are a check (step 7), and states do publish them | AI |
| Lookup endpoint now, not in step 7 | The review needed it to be usable on NE; step 7's checks need the same data | AI |
| Edits reset for each new table | Keys are locators; a different file's "row 2" is a different row | AI |

## Corrections and surprises
- The tests passed and the table worked, but only the real files showed that the main bulk
  action would have mislabelled codes on NE's last page.
- A deliberate break did not fail its test: the test checked a case where the default filter
  already hid the difference.
- A one-line validation in the reference loader had blocked every local load for a day; CI
  loads (remote, with a row budget) never hit it.
- GA's "Yes/No" column has no column role yet; excluded rows are a step 7 job.

## What a non-technical builder should take from this
- Try the tool on the biggest real file you have; the problems it shows are not in the small
  test files.
- When a person would answer a question by looking something up, ask the AI to look it up
  for them.

## Numbers
- Review on real files: GA-A 1,686 rows (74 to decide), LA 2,526 (322; 50+ not in CMS), MT 314
  (37; 3 cannot be read), NE 8,146 (102 after the CMS lookup, 57 after one bulk answer; 12 not
  in ICD-10-CM).
- Tests: 62 new Vitest (shared 39, component 19, API 4); admin e2e extended (review, edit form
  under axe).
- Time: start to end above. AI cost: not measured. Hosting: $0.

## Open threads
- Step 7: send reviewed rows to a draft; GA "Yes/No" → `attributes.included`; checks use the
  same lookup for `knownIcd10cm`.
