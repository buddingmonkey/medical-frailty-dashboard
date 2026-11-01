# Contributing

Thank you for helping. There are two ways to contribute.

## Report a data error

If a code, description, category or date does not match a state's document, open a
[data error issue](../../issues/new?template=data-error.yml) with the state, the code and a link
to the state's document. **Never include patient or member information.**

## Change the code

### Setup

You need Node 26 (see `.nvmrc`) and pnpm 12 (`npm i -g pnpm@12`).

```bash
pnpm install
pnpm --filter @mfcd/web exec playwright install chromium   # once, for the browser tests
pnpm dev                                                    # http://localhost:8787
```

`pnpm dev` runs the site behind its pre-launch gate, signed in as a local admin
(`dev@localhost`). Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars` only if you need
local secrets.

### Workflow

1. Branch from `main`.
2. **Write the failing test first**, then the code (`docs/testing.md`).
3. Run `pnpm check` after every change. Run `pnpm check:full` (adds the build and browser
   tests) before opening a pull request.
4. Open a pull request. CI must pass (`check`, `audit`, `gitleaks`, CodeQL) before it can be
   merged; nobody can push to `main` directly.

### Rules

These are also in [`CLAUDE.md`](CLAUDE.md), which AI assistants read:

- TypeScript strict, no `any`, no `@ts-ignore`. Validate API input with the zod schemas in
  `packages/shared`.
- No patient data: never add a field, upload path or log line that could hold a member's name,
  ID or claim.
- CPT descriptions: show only the text the state published, with its citation.
- Admin features live only under `/admin` and `/api/admin`.
- Secrets go in `wrangler secret` or `apps/api/.dev.vars`, never in the repo. The repo is public.
- Pin exact dependency versions. pnpm refuses packages younger than 3 days; if a version is too
  new, use the previous one.
- The AI skill folders (`.agents/`, `.claude/skills/`, `skills-lock.json`) stay untracked
  (`docs/architecture.md`, "Agent skills").

### Where to start

[`docs/status.md`](docs/status.md) says where things stand; [`docs/roadmap.md`](docs/roadmap.md)
lists the next steps.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
