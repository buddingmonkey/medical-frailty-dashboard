# 2026-11-02: Rebuild coverage

**Milestone:** after M5 (preview data, step 2)  •  **People:** project lead  •  **AI:** Claude Code, Opus main session

Start 22:31 CST, end 22:40 CST (`date`).

## Why
Admin writes keep the derived tables current one change at a time. Those tables are each
category's full code list, the entry placements and pair similarity. Rows loaded as SQL get
none of that: the preview seed is one case, and a new CCSR or ICD-10-CM release is another
(an open thread since M5).

## What happened
1. `POST /api/admin/coverage/rebuild` rebuilds, in order:
   - each category's full code list, for every category that isn't retired (drafts included,
     for the admin preview);
   - the placements in every state;
   - the similarity of every pair.

   Each step writes only the difference, so a second run changes nothing. It bumps
   `data_version` and writes one `coverage.rebuild` audit row.
2. Test first. The test builds the overview fixture through the admin API and saves the
   derived rows. It then deletes them, as seed SQL leaves them, and rebuilds. It expects the
   same rows back (similarity apart from `computed_at`). Skipping the code-list step on purpose
   failed it.
3. The **Rebuild coverage** button is at the bottom of Admin → Unified categories. When it
   finishes, it shows the counts.

## Open threads
- Use it after the seed load (step 3) and after the next CCSR release.
