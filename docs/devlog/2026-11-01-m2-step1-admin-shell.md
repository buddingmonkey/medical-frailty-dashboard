# 2026-11-01: M2 step 1, admin shell and audit log

**Milestone:** M2 step 1  •  **People:** project lead (not involved in this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 22:43 CST, end 22:48 CST (`date`).

## Goal
The `/admin` area every later M2 step plugs into: a layout that shows who is signed in, and
an audit log page backed by a read API.

## What happened
1. Tests first in each layer: zod schemas for the audit query and response (shared), the
   `GET /api/admin/audit` route (newest first, cursor paging, 400 on a bad query, 403 for a
   signed-in non-admin), and component tests that render the real file-based routes with MSW.
   All failed before the code existed.
2. Built `auditInsert()`, which returns the insert without running it, so publish and
   rollback (step 8) can write their audit row in the same transaction as the change.
3. The audit page shows details as plain text. To prove the test guards that, the details
   cell was switched to `v-html` for one run: the test failed; code restored.
4. `pnpm check` found a type that "cannot be named" in the new test helper; fixed by
   returning only what the tests use.
5. New e2e test: `/admin`, `/admin/audit` and the audit API return 401 with `noindex` and
   `no-store` to a visitor who is not signed in. Then a one-off check in `pnpm dev` (dev
   identity): axe found nothing in light or dark, no console errors; screenshots looked right.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Cursor paging by id, not page numbers | New rows arrive at the top; offsets would shift and repeat rows | AI |
| Details shown as raw JSON text | Admin-only, few entries for now; no `v-html` with data (CLAUDE.md) | AI |
| Sign out links to Access's `/cdn-cgi/access/logout` | Access owns the session; the app has none of its own | AI |
| No audit writes yet | Nothing changes data until step 2; each later step writes its own audit rows | AI |

## Corrections and surprises
- The handoff noted that `docs/status.md` still said the production reference load was
  waiting for approval; it finished on 2026-11-01. Corrected.

## What a non-technical builder should take from this
- When a test says "this is safe", break the code on purpose once and watch the test go red.

## Numbers
- Time: about 5 minutes.
- AI cost: not measured. Hosting: $0.
- Tests: 5 unit, 4 API, 7 component, 1 e2e new (unit 202, component 13, API 59, e2e 6).

## Open threads
- M2 step 2: watch dates page, seeded from `docs/status.md`.
