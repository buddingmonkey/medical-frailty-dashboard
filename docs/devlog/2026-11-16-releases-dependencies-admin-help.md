# 2026-11-16: v0.10.0 and v0.10.1, Dependabot, and field help in admin

**Milestone:** M8 (alongside launch work)  •  **People:** project lead  •  **AI:** Claude Code,
Opus main session, 3 builder agents

Start 2026-11-14 evening CST, end 12:41 CST 2026-11-16 (`date`; includes long waits for the
project lead's deploy approvals).

## Goal
Clear the open Dependabot pull requests, release the Indiana work (v0.10.0), help the project
lead run the Indiana steps on production, and fix what was confusing on the way.

## What happened
1. Dependabot: merged the Actions update (#112) and hono (#116); closed #115 (no lockfile).
   The 23-package group (#117) failed: `wrangler` and `@cloudflare/vitest-plugin` bring workerd
   1.20261110, whose SQLite rejects the state-similarity statement ("VIEWs and/or subqueries
   nested too deep"). The statement expands the `sets` CTE four times; three works. Hosted D1
   (preview) still accepts it. Replaced #117 and #120/#121 with #119 and #122, which hold those
   two back, and told Dependabot to skip them. prettier 3.10 rewrapped three templates.
2. Tagged v0.10.0 (migrations 0016, 0017) and, after the project lead asked, v0.10.1. Both
   deployed after the project lead approved the production job.
3. The project lead tried to "re-upload" Indiana's CSV; the upload refused it as a duplicate.
   That was right: the AI's instructions were wrong. The step is to open the stored file in
   Read and map again. Docs fixed (#126).
4. "Re-run automatic suggestions" said only that no reference list existed. It now says how to
   make one (#127).
5. Nebraska has no state categories, so its one row said "Not mapped" although Indiana's
   suggestions classified 4,096 of 8,182 entries. The status now gives that count (#129).
6. A watch date came within 14 days, its banner added a second `role="status"`, and six admin
   e2e tests failed in strict mode on every PR (#124). Tests now find their own message.
7. Windows API tests timed out three times: the 120 s allowance applied to hooks only, not
   tests (#128).
8. The project lead asked for (i) tooltips on admin edit fields. One builder did the category
   forms (#130); two more did ingest/review/drafts and the other pages in parallel (#131).

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Hold back wrangler and the vitest plugin | New workerd rejects the similarity SQL; production unaffected today | AI (recorded in status.md) |
| Dependabot `ignore` for those two | Stops a failing PR every week | AI |
| Tooltips only where a field is not obvious; one per column for per-row inputs | Avoids clutter | AI, within the project lead's request |
| Named bundle budget for `categories.js` | Admin-only help text; loaded on demand | AI |

## Corrections and surprises
- The AI said "re-upload" when the site deliberately stores each file once.
- Three overlapping `gh run watch` loops used up the GitHub API rate limit (5,000/hour). Poll
  every 1–3 minutes instead.
- The release deploy waits for approval in GitHub ("Review deployments"); the AI's watcher
  read "waiting" as still running.
- Tooltip button names ("About Label") matched non-exact `getByLabel('Label')` in e2e.

## What a non-technical builder should take from this
- When a dependency update fails, read the first error: it can be a real future risk (here,
  SQL that a newer database rejects), not just a broken test.
- Date-based features (banners, reminders) can break tests on a calendar day with no code change.

## Numbers
- PRs merged: #112, #116, #119, #122, #124, #126–#131. Releases: v0.10.0, v0.10.1.
- Nebraska: 4,096 of 8,182 entries classified by Indiana's suggestions (production).
- `pnpm check:full` at the end: 792 unit, 401 component, 653 api, 287 e2e.

## Open threads
- Rewrite the state-similarity statement so the new workerd can come in; then drop the
  Dependabot `ignore`.
- Publish the 19 starter comparison categories on production (Compare tabs are empty).
- Idea, not approved: a states × federal category table on Compare, with "Not yet classified".
- Release #129–#131 (next tag).
