# 2026-11-02: M2 step 7, draft versions

**Milestone:** M2 step 7  •  **People:** project lead (none needed this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 08:32 CST, end 09:22 CST (`date`).

## Goal
Send reviewed rows to a draft version in chunks, run the checks on the server, and show the
report and the diff (with a CSV download).

## What happened
1. Shared first, test first: `drafts.ts` (entry schema, `toDraftEntries`, `validateDraftEntry`,
   `findNamedStates`), a block check for an upload that stopped half way, and two column roles
   for Georgia's "Yes/No" and "Rationale".
2. Drafts API with 13 tests, then `SendToDraft.vue`, the draft page and a drafts list.
3. The browser e2e failed where every unit test passed: three tests created Nebraska drafts at
   once, and "read the highest number, insert +1" collided on the unique index. Two admins
   could do the same. Now one statement; a test fires five creates at once.
4. Real files on `pnpm dev`: the checks crashed on NE ("too many SQL variables"): 100 codes
   plus the code system is 101 bound parameters, one over D1's limit. A test with 150 codes
   reproduced it.
5. Then the real file showed a design bug: NE's PDF has two tables (ICD codes, then CPT/HCPCS),
   and sending the second table would have deleted the first, because "send a source again"
   replaced all of the file's rows. Rows are now stored per part (table or sheet). The
   migration had not left this branch, so it was rewritten, and the two local databases were
   reset.
6. Adding the `source_part` column pushed each insert from 96 to 102 bound parameters; the
   150-code test caught it. Rows per insert now follow from the column count.
7. MT's and NE's state names never reached the state-name check: the PDF adapter dropped the
   title lines. It now returns them (`titleText`); NE's contents page names Nebraska.
8. Deliberate breaks (blanking in `findNamedStates`, the draft-status guard, forgetting the
   created draft on retry, the change filter, the PDF title) each failed their tests.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Rows stored per part (table/sheet), not per file | One PDF or workbook can hold several tables with different headers; each is mapped and reviewed on its own | AI |
| Rewrite migration 0005 instead of adding 0006 | It existed only in this branch and local test databases | AI |
| Source must be stored first (by hash), not uploaded from the ingest page | The source page collects the title, URL and date that become the citation | AI |
| Checks report kept in `check_report_json` with a token over entry ids and parts | Step 8 publishes only what was checked | AI |
| Discarded drafts are kept | Audit trail; they are small | AI |

## Corrections and surprises
- Three bugs passed every unit test and showed up only with parallel browser tests or real
  files: a race, a bound-parameter limit (twice), and a design that lost NE's second table.
- My own throwaway scripts failed four times on selectors, and once because I had not
  migrated the dev database. Each cost a rerun, not a bug.
- `wrangler d1 execute --local` does not report `rows_written`, so the writes-per-entry
  estimate in `docs/deployment.md` still needs a measurement on preview (step 11).

## What a non-technical builder should take from this
- Run the real thing with the biggest real file before calling a step done; three of this
  step's bugs were invisible otherwise.
- When two people might click the same button at the same time, ask the AI what happens.

## Numbers
- NE (8,183 entries, two parts): sent in 1.4 s, checks in 0.2 s (local). MT: 311 entries,
  0.14 s.
- Tests: 43 new Vitest (shared 10, component 17, API 16, counted from `pnpm check`); admin
  e2e 3 new (send to a draft, axe light and dark).
- AI cost: not measured. Hosting: $0.

## Open threads
- Step 8: publish with the token and typed confirmations, R2 backup, rollback.
- Measure writes per entry on preview (step 11) before the downgrade to Free on 2026-11-30.
