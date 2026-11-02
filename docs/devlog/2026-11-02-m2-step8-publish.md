# 2026-11-02: M2 step 8, publish and rollback

**Milestone:** M2 step 8  •  **People:** project lead (none needed this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 09:25 CST, end 09:37 CST (`date`).

## Goal
Publish a checked draft atomically and per state, with a backup first, and roll back to any
earlier version. Write the three required tests from `docs/testing.md`.

## What happened
1. API test first (14 tests), including the required ones: publishing MT leaves every NE row,
   version, part, link and mapping identical; a large change is refused without the typed
   state code (missing, wrong state, blank) and accepted with " mt "; rollback gives back the
   exact rows of `publishedEntries()`.
2. Publish re-runs the checks on the server: the token the admin saw must match the rows now
   (409 otherwise), and `verifyConfirmations` (shared with the browser) must pass. Then the R2
   backup, then one batch: merge duplicates, supersede, publish, move the pointer, bump
   `data_version`, audit.
3. Duplicates now include the tier, so the same code in GA Attachment A and B is not merged
   away (new test in `checks`).
4. UI: a Publish panel on the draft page, `/admin/versions` with Restore (two clicks).
5. The browser e2e found two things: the panel's success message disappeared because the
   refreshed draft is no longer a draft (the page now says "This is Nebraska's public list"),
   and my test listed the checkboxes before the checks had loaded.
6. Deliberate breaks: no state filter on "supersede" failed the isolation test; skipping the
   confirmations failed the typed test; an always-ready button and a one-click restore failed
   their component tests.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Server re-runs the checks at publish, not only reads the stored report | The stored report can be stale; the token compares the live rows | AI |
| Rollback is two clicks, no typed code | Rollback restores something that was already public and checked; the docs call it one-click | AI |
| Duplicates key includes the tier | GA lists codes in both tiers; merging them would lose a tier | AI |

## Corrections and surprises
- The isolation test passed before publish existed (nothing changed anything). It only proved
  itself after the deliberate break.
- The e2e database persists between local runs, so a test that assumed "nothing published"
  broke once another test published. Each test now owns a state.

## What a non-technical builder should take from this
- A safety test that passes before the feature exists proves nothing yet; break the feature
  on purpose and watch the test fail.

## Numbers
- Tests: 20 new Vitest (API 11, shared 4, component 5; counted from `pnpm check`), 1 new
  admin e2e (publish twice, restore, axe). 7 admin e2e, stable over 3 runs.
- AI cost: not measured. Hosting: $0.

## Open threads
- Backup pruning (20 per state) and the 30-day draft clean-up need a scheduled job.
- Step 11 loads all four seed states on preview and tries a wrong file.
