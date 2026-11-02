# 2026-11-01: M0 step 8, builder agent (M0 complete)

**Session:** 2026-11-01 20:47–20:55 CST  •  **Milestone:** M0 step 8  •  **People:** project lead  •
**AI:** Claude Code, Opus main session; one Haiku builder proof run

## Goal

Write `.claude/agents/builder.md`, the standing rules for a builder agent that takes one
approved step. The roadmap's second part, a project skill for adding a state source, waits
for M2.

## What happened

1. The project lead marked step 7 done and asked for step 8.
2. The AI checked the current subagent file format in the Claude Code docs and proposed a plan
   with three questions. The project lead chose: model **inherit** by default, but the main
   session may pick a cheaper model for pure rote coding; skip the proof run unless it tests
   something new; merge PR #10.
3. The AI wrote the builder file: rules drawn from `CLAUDE.md`, `status.md` and M0's lessons,
   with no starting of other agents, staging by path, no pushing or PRs, and a fixed report
   format.
4. The proof run was new (no subagent had run yet), and the project lead said to do it. Agent
   files load only at session start, and the `/agents` command no longer reloads them, so the
   project lead restarted the session.
5. The builder, on Haiku, repeated its rules correctly and ran only the one allowed command.
   Its answer quoted a stale `CLAUDE.md` line ("production deploys from CI on `main`";
   since step 7 it is a `v*` tag after approval). Fixed, along with the "Status: planning"
   banner.

## Decisions

| Decision | Why | Who decided |
| --- | --- | --- |
| Builder model `inherit`; main session may pass a cheaper model for pure rote coding | Builders touch auth and tests; rote work doesn't need the big model | Project lead |
| Builders are optional; the main session keeps planning, review, devlog and PR | A builder never saw the conversation with the project lead | AI, approved with the plan |
| Builder can't start agents or workflows, can't push, PR, tag or change settings | Keeps each builder small and its effects reviewable | AI |
| No worktree isolation | Each worktree would need its own `pnpm install` | AI |
| "Add a state source" skill moves to M2 step 12; where it lives is open | `.claude/skills/` is kept untracked for third-party skills | AI raised, project lead to decide |

## Corrections and surprises

- **A new agent file does nothing until restart.** The `/agents` wizard was removed from
  Claude Code; the session must restart to load `.claude/agents/*.md`.
- **The proof run checked the docs too:** the builder faithfully repeated a `CLAUDE.md` line
  that had gone stale in step 7.
- `CLAUDE.md` said every step should be built by a builder; in practice the main session built
  all of M0. Reworded to "builders are optional".

## What a non-technical builder should take from this

1. When you add a helper agent, ask it to recite its rules once before giving it real work.
   Cheap, and it shows what it actually read.
2. Top-level instructions drift. When a step changes how things work, check `CLAUDE.md` says so.

## Numbers

- Time: 8 minutes (20:47–20:55 CST), plus a session restart.
- Money: $0. The proof run used about 34k tokens on Haiku.
- Lines: about 80 lines of agent rules; about 30 lines of docs.
- **M0 totals:** steps 1–8 in about 1.5 hours of building time over one day; 5 unit,
  6 component, 41 API and 5 E2E tests; `v0.0.1` live on preview and production behind Access;
  hosting $0.

## Open threads

- M1 step 1: Drizzle schema and first migration.
- M2 step 12: where the project skill lives.
- Old merged branches on GitHub (`m0-step2-web` … `m0-step5-auth`) can be deleted.
