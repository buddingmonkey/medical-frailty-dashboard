# 2026-11-01: M0 step 1, pnpm workspace

**Session:** 2026-11-01 15:46–15:52 CST  •  **Milestone:** M0 step 1  •  **People:** project lead  •
**AI:** Claude Code, Opus main session, no subagents

## Goal

Create the empty workspace (`apps/web`, `apps/api`, `packages/shared`) with strict TypeScript,
ESLint, Prettier, `.editorconfig`, `.nvmrc` and the extra `.gitignore` entries. Get lint and
typecheck passing. Nothing else.

## What happened

1. The project lead gave a fixed prompt: read `CLAUDE.md`, `docs/status.md` and the M0
   roadmap; propose a plan with exact versions checked online; wait for approval.
2. The AI looked up current versions on the npm registry and nodejs.org instead of using
   memory. It found that Node 26 is now LTS, TypeScript 7 is `latest`, pnpm was not
   installed, and Node 25+ no longer ships corepack.
3. The AI proposed a plan and asked four questions (skill folders, `.nvmrc` form, installing
   pnpm, a release-age guard). The project lead answered and installed pnpm themselves.
4. The AI created the files, installed dependencies, and got `pnpm lint`, `pnpm typecheck`
   and `pnpm format:check` passing. Then it tried a deliberately bad file to confirm the
   checks fail on `any`, `@ts-ignore` and an unchecked array index.
5. The AI updated the docs: `architecture.md` ("Tool versions", "Agent skills"),
   `roadmap.md`, `playbook.md` and `status.md`.

## Decisions

| Decision | Why | Who decided |
| --- | --- | --- |
| Pin TypeScript 6.0.3, not 7.0.2 | `typescript-eslint` supports only `<6.1.0`; `vue-tsc` needs the JS API that TS 7 dropped | AI proposed, project lead approved |
| `.nvmrc` = `26` (major only) | Picks up Node security patches without editing the file | Project lead (AI recommended) |
| `minimumReleaseAge: 4320` (3 days) in pnpm | Blocks most hijacked package releases; costs nothing | Project lead (AI recommended) |
| Leave `.agents/`, `.claude/skills/`, `skills-lock.json` untracked, but document their sources | Third-party files; another dev can reinstall them from the documented sources | Project lead |
| Do all `.gitignore` additions now, not in step 6 | The roadmap had the same task in two steps | AI, noted in the plan |

## Corrections and surprises

- **The 3-day guard worked on its first install.** `eslint@10.14.0` (2 days old) and
  `globals@17.14.0` (published that morning) were refused, so the AI stepped back to 10.13.0
  and 17.13.0.
- **The strict lint rules flagged the AI's own ESLint config** for using
  `tseslint.config()`, which is deprecated, and the AI switched it to `defineConfig()`. The AI's
  default way of writing the config was already out of date.
- **A skill was installed but invisible.** `tailwind-design-system` sits only in
  `.agents/skills/`, not in `.claude/skills/`, so Claude Code does not list it. This was found
  while documenting where each skill came from. Step 2 needs it linked.
- "Latest" was not the right choice for TypeScript: the newest major broke the lint tools.

## What a non-technical builder should take from this

1. Ask the AI to check versions online, not from memory. Here, the tools had moved on (a new
   Node LTS, TypeScript 7, pnpm no longer bundled with Node).
2. A safety rule that refuses brand-new packages costs nothing. When it trips, use the
   previous version instead of turning the rule off.
3. Have the AI prove a check works by feeding it something that should fail.

## Numbers

- Time: 6 minutes (15:46–15:52 CST), plus the project lead's pnpm install.
- Money: $0 hosting. AI usage not measured.
- Lines: about 200 lines of new config and placeholder code (excluding `pnpm-lock.yaml`),
  about 65 lines of docs changed.
- Tests added: 0 (the test harness is step 4). Checks passing: lint, typecheck, format.

## Open threads

- ~~Link `tailwind-design-system` into `.claude/skills/` before step 2.~~ Done by the project lead at 15:53.
- `pnpm check` (one line per stage) comes in step 4; until then run `pnpm lint` and
  `pnpm typecheck`.
- Revisit TypeScript 7 when `typescript-eslint` and `vue-tsc` support it.
