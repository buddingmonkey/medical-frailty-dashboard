# 2026-11-01: M1 step 6, migrations and reference data in the deploy

**Milestone:** M1 step 6  •  **People:** project lead (not involved in this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 21:52 CST, end 21:56 CST (commit time).

## Goal
Apply D1 migrations on every deploy, keep a restore point before production migrations, and
give the reference-code load a path into preview and production.

## What happened
1. Checked the commands against the preview database first (read-only):
   `wrangler d1 time-travel info DB --env preview --json` returns a bookmark, and accepts the
   binding name.
2. `deploy.yml` now records the bookmark (in the run summary, with the restore command), then
   runs `wrangler d1 migrations apply DB --remote`, then deploys. Same for both environments.
3. New manual workflow **Reference data**: build from the pinned CMS files, then load with a
   row budget. It uses the environment's own secrets and approval rule, and the deploy's
   concurrency group, so it never runs during a migration.
4. The loader allows `--env production` only inside GitHub Actions; locally it refuses.
5. `actionlint` and `pnpm check` pass.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Bookmark for both environments, not only production | Free, and preview restores are the drill for production (`docs/deployment.md`) | AI |
| Reference load as a separate manual workflow | It spans two days; a deploy must not wait for it | AI |
| Production reference load needs the same approval as a production deploy | Every production change goes through the project lead | AI, following `CLAUDE.md` |

## Corrections and surprises
- The planned D1 export (M1 planning) was replaced by Time Travel back in step 1, so this step
  had no export to build.

## What a non-technical builder should take from this
- Try each new command on the test environment, read-only, before writing it into an
  automated pipeline.

## Numbers
- Time: about 4 minutes.
- AI cost: not measured. Hosting: $0.

## Open threads
- After merge: the preview deploy runs the first real migration; then start the preview
  reference load.
- Production gets the schema with the next `v*` tag (project lead approves) and its reference
  load after that.
