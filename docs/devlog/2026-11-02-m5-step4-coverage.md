# 2026-11-02: M5 step 4, coverage summary

**Milestone:** M5 step 4  •  **People:** none needed this step  •
**AI:** Claude Code, Opus main session (brief, review) and one builder agent (Opus)

Start 17:40 CST, end 17:59 CST (`date`). Builder: 17:41–17:58.

## Goal
Precompute which unified categories each published entry counts under, and serve the
state × unified category numbers from SQL, so public requests stay inside the Free plan's CPU.

## What happened
1. Migration `0009_entry_unified`: `entry_unified` (placements of published entries) and
   `unified_universe` (billable ICD-10-CM codes in each category's CCSR groups), both
   `WITHOUT ROWID` with guard tests.
2. `recomputePlacements()` runs after publish, rollback, mapping approval and CCSR-set or
   status changes; it writes only the rows that changed, in one batch, and bumps
   `data_version` again when it changed anything (so a cached overview never mixes versions).
3. `GET /api/public/overview`: entries placed, universe codes covered (exact, prefix and range
   coverage in SQL), universe size, share qualifying alone, reviewed. 44–49 ms locally, 5 KB.
4. Deliberate break: placing entries in draft categories failed 4 tests.

## Numbers (local, real four-state data and CCSR)
- Nebraska recompute (8,182 entries): 88–111 ms wall time; ~8.2k D1 writes when every entry
  moves, 0 when nothing changes.
- A published category with the schizophrenia, depression and bipolar CCSR groups: 158 universe
  codes; created with a four-state recompute in 0.61 s.
- Tests: API 220 (+17). AI cost: not measured. Hosting: $0.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Write only changed placements | An approval that moves a few entries must not rewrite 8k rows | AI (builder), accepted |
| Pair similarity moves to step 7 | It is used only there | AI |

## Corrections and surprises
- D1 `db.batch()` returns rows as objects: two joined columns named `id` collide silently.
- `INSERT … SELECT … ON CONFLICT` needs `WHERE true`, or SQLite reads ON as a join.

## Open threads
- CPU of a recompute on the Free plan: read `placements.recompute` log lines on preview.
- New CCSR or ICD-10-CM releases do not rebuild universes and placements yet.
