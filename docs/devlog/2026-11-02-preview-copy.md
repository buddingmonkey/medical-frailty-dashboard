# 2026-11-02: Copy preview's state lists to production

**Milestone:** after M5 (preview data)  •  **People:** project lead  •  **AI:** Claude Code, Opus main session

Start 22:10 CST, end 22:30 CST (`date`).

## Why
The project lead asked for preview to become a test site with seed data and a banner, and
for production to hold the real data that admins edit. The four states (GA, LA, MT, NE) had
been loaded only on preview, in M2 step 11. Production had reference codes and no lists. The
lists are real: the states sent them, and Louisiana's came by email from the state's Medicaid
agency. The project lead's answer was "Push the data to prod then replace it."

## What happened
1. `scripts/copy-state-data.ts` copies the state tables and the R2 source files from preview
   into an empty target. It is tested first. The rule that blocks production outside CI and
   the empty-target check were each broken on purpose, and their tests failed.
2. The first dry run into a fresh local D1 failed with `SQLITE_TOOBIG`. Montana's check report
   is 717 KB, and a D1 statement holds about 100 KB. That table is now built from query rows,
   and its report is appended in 20,000-character pieces.
3. The second dry run took 52 s. Row counts, check-report length, entry checksums, states,
   mappings and audit details all matched preview.
4. The workflow **Copy state data** runs the copy on production. It waits for the production
   approval, needs a typed confirmation and runs only from `main`.
5. Found on the way: without `shell: bash`, a `run:` step has no pipefail, so `| tee` hid
   failures. Fixed here and in **Reference data**.

## Open threads
- Run **Copy state data** once this is merged and the CCSR load has finished. Then reset
  preview to seed data (next steps: rebuild coverage, seed, banner).
