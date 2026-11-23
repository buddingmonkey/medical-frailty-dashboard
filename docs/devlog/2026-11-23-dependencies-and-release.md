# 2026-11-23: Release v0.12.0, Dependabot updates, ui-sdk exemption removed

**Milestone:** M8 (between steps)  •  **People:** project lead  •
**AI:** Claude Code, Opus main session (no builders)

Continues `2026-11-21-connecticut-ingest.md`. Times: 2026-11-21 about 15:30 to 17:40 CST
(release, notes for the project lead), 2026-11-23 about 11:20 to 12:10 CST (dependencies, logs).

## Goal

Ship the Connecticut ingest work, hand the project lead what they need to load CT, then clear
the waiting Dependabot PRs and the expired package-age exemption.

## What happened

1. **Release.** The project lead said "Please tag it". `v0.12.0` was tagged on `main`
   (87f612a, PR #141). CI passed; the project lead approved the production deploy, which
   finished 2026-11-21 17:39 CST with migration 0018 (`system_mappings`).
2. **Retired codes as CSV.** The project lead asked for CT's 64 codes that are not in ICD-10-CM
   FY2027. The lead sent them as a CSV file (sheet row, system, code, CT's description), not a
   published page: it is a working file, for example to send to the state.
3. **Override by code system, in detail.** The project lead asked how the new step works. The
   lead read `categories.vue` and explained: where the section is and when it shows, the
   preview and save, why to set it after publishing (the preview counts only published
   entries), what wins over it, and how to undo it.
4. **Dependabot #142** (16 minor and patch updates, including wrangler 4.162 → 4.165 and its
   vitest plugin, which broke the similarity SQL once before). Full check run locally:
   - The first run passed, but on `main`: `gh pr checkout 142 -q` had failed silently (the
     output was piped through `tail`). The installed wrangler (4.162.0) gave it away.
   - On the real branch, every stage passed except e2e (281 of 287 failed): the new
     Playwright needed a newer Chromium on this machine. After
     `pnpm --filter @mfcd/web exec playwright install chromium`, 287 of 287 passed. Merged.
5. **Dependabot #123** (jsdom 30 → 31, a major version). After `@dependabot rebase` it came in
   as 31.0.1. The breaking change that could matter is the new CSS engine (computed styles),
   which only component tests use; 415 passed, CI green. Merged.
6. **ui-sdk exemption.** The project lead said "Remove the exemption". The pinned
   `0.1.0-beta.1` versions were published 2026-11-12 (checked with `pnpm view … time`), so they
   pass the 3-day rule. PR #143 removed the entries; lockfile unchanged. Merged on green CI.

## Decisions

| Decision | Why | Who decided |
| --- | --- | --- |
| Tag `v0.12.0` for CT | Migration 0018 is needed before CT can be classified on production | Project lead |
| Merge #142 and #123 | Full local check plus CI green; wrangler checked against e2e because of the earlier SQL break | AI (merge on green, within the milestone) |
| Remove the ui-sdk age exemption | Its end date (2026-11-15) had passed and the versions qualify | Project lead |

## Corrections and surprises

- A green check on the wrong branch. Piping `gh pr checkout` through `tail` hid its failure,
  and the full check then passed on `main`. Checking the installed version caught it before
  the merge. Lesson in `docs/playbook.md`, section 6.
- A Playwright bump fails every browser test until the matching browser is installed. The
  error ("Executable doesn't exist") says so plainly. CI installs it on each run, so only
  local machines are affected.

## What a non-technical builder should take from this

- After a dependency update, check that the new versions are really installed before trusting
  a green test run.

## Numbers

- Tests at the last merge: unit 848, component 415 (5 skipped), api 670, e2e 287.
- PRs merged: #142, #123, #143. Money: not measured.

## Open threads

- ~~Load CT on production~~: done; the project lead reported it loaded on 2026-11-23.
- The dependency updates and the exemption removal are on `main` only; they ship with the next
  release tag.
- From 2026-11-21: a restore from a backup older than 0018 clears system overrides; the
  partial NDC search while typing; NDC members in condition groups via the API.
