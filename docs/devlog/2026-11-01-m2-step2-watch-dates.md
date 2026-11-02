# 2026-11-01: M2 step 2, watch dates page

**Milestone:** M2 step 2  •  **People:** project lead (not involved in this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 22:50 CST, end 22:58 CST (`date`).

## Goal
Move the "Watch dates" table out of `docs/status.md` and into the app, so deadlines (the
Workers Paid downgrade, the *Mass. v. Oz* appeal window) are tracked where admins work.

## What happened
1. Shared first: zod schemas for create, edit, close and list; pure `groupWatchItems`,
   `addDays` and `nextRepeatDate`, tested at the 14-day edge, across year ends and leap days.
2. API: list, create, edit, close (409 once closed, 400 for an unknown state). A close, its
   audit row and the next repeating item go in one `db.batch()`.
3. Seed: a hand-written data migration (`0002_seed_watch_items`) with the nine rows from
   `docs/status.md`, so preview and production get them through the normal CI deploy. A test
   reads them back through the API, which would catch a bad JSON link.
4. Web: `/admin/watch` (groups, History tab, add/edit/close forms) and a banner on every admin
   page with the overdue and due-soon counts.
5. Mistakes caught by tests: my seed test expected the wrong first item (the Nov 30 downgrade
   sorts before the Dec 1 HCPCS file); the group headings had ids with spaces, which breaks
   `aria-labelledby` (it is a space-separated list), so the sections had no names.
6. Broke a rule on purpose: let links take any URL scheme. Four tests in three layers failed
   (shared, API, component). Restored.
7. Hands-on in `pnpm dev`: axe clean in light and dark with the add form (showing errors) and
   a close form open, and on History; no console errors.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Seed through a migration, not a script or button | Runs once per database, in CI, with the usual restore bookmark | AI |
| `state_id` NULL in the seed; no state picker yet | No states are loaded, and the column references `states` | AI |
| Links http(s) only; notes shown as plain text | No script from stored data, no `v-html` | AI |
| Banner groups by the admin's local date; repeat dates use UTC | The page is read by people in US time zones; the server has no time zone | AI |

## Corrections and surprises
- Stopping the dev server with `pgrep -f` matched the stopping command's own shell and killed
  it. Listing PIDs with `ps` first, then `kill` by number, worked.

## What a non-technical builder should take from this
- When you move a to-do list from a document into the app, say which one is the source of
  truth from now on, in both places.

## Numbers
- Time: about 8 minutes.
- AI cost: not measured. Hosting: $0.
- Tests: 21 unit, 11 API, 7 component new (unit 223, component 20, API 70, e2e 6).

## Open threads
- Step 8 creates a "Re-check <state> list" item 90 days after each publish.
- Step 3: source upload to R2.
