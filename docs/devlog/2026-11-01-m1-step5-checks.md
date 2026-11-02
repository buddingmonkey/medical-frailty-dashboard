# 2026-11-01: M1 step 5, checks and diff engine

**Milestone:** M1 step 5  •  **People:** project lead (not involved in this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 21:53 CST, end 22:01 CST (from the PC clock).

## Goal
Pure functions for the pre-publish checks and the diff against the published version, with a
test for every check in `docs/ingestion.md`.

## What happened
1. Tests first: 21 tests, one or more per check, including the thresholds at their edges
   (2% invalid allowed, 2.9% blocked; 30% removed asks, 29% does not).
2. The implementation passed on the first run, so two rules were broken on purpose (30%
   threshold, typed state code). One test failed each time; code restored.
3. The required test "a publish over a typed check fails without the typed confirmation" now
   exists for the pure gate. The API version comes with the publish route (M2).

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| A code's identity excludes its category | A category move must read as "changed", not "removed + added", or the removal check overreacts | AI |
| The caller supplies counts that need I/O (invalid rows, named states, known ICD codes) | Keeps the engine pure, so browser and API share it | AI |
| Report token deferred to the publish route | It ties the report to stored rows, which exist only in M2 | AI |

## Corrections and surprises
- None in this step. The ingestion doc left several definitions open (what "removed" counts,
  what a duplicate is); they are now written next to the table.

## What a non-technical builder should take from this
- Test the edges of every limit (exactly 2%, just over 2%). That is where off-by-one mistakes
  hide.

## Numbers
- Time: about 8 minutes.
- AI cost: not measured. Hosting: $0.
- Tests: 21 new (197 unit total); all passing.

## Open threads
- M1 step 6: migrations and the reference-code load in deploy, then the M1 review.
