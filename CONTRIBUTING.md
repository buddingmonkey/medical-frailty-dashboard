# Contributing

Thank you for helping. There are two ways to contribute.

## Report a data error

If a code, description, category or date on the site does not match the state's document,
open a [data error issue](../../issues/new?template=data-error.yml). Give the state, the code
and a link to the state's document. **Never include patient or member information.**

## Change the code

### Setup

New to this? Follow [`docs/getting-started.md`](docs/getting-started.md) first, then
[`docs/playbook.md`](docs/playbook.md). Windows (PowerShell), macOS and Linux all work.

`main` is protected, so outside contributors fork the repo and open a pull request from the
fork.

You need Node 26 (see `.nvmrc`) and pnpm 12.16.1 (`npm i -g pnpm@12.16.1`). The same commands
work in PowerShell, cmd and bash:

```text
pnpm install
pnpm db:migrate:local   # local database: tables
pnpm db:ref:local       # CMS reference codes, about a minute
pnpm db:seed:local      # sample state lists
pnpm dev                # http://localhost:8787
```

After `pnpm dev` starts, open Admin, Unified categories (`/admin/unified`) and press
**Rebuild coverage** once, so Compare and the map fill in.

`pnpm dev` runs the site behind its pre-launch gate, signed in as a local admin
(`dev@localhost`). You need no secrets. Copy `apps/api/.dev.vars.example` to
`apps/api/.dev.vars` only if a maintainer asks you to.

### Workflow

1. Branch from `main`.
2. **Write the failing test first**, then the code ([`docs/testing.md`](docs/testing.md)).
3. Run `pnpm check` after every change. `pnpm check:full` adds the build and browser tests;
   CI runs it on every pull request. To run it yourself, install the test browser once:
   `pnpm --filter @mfcd/web exec playwright install --with-deps chromium`.
4. Open a pull request. CI must pass (`check`, `audit`, `gitleaks`, CodeQL) before it can be
   merged. Nobody can push to `main` directly.

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
- Docs name roles ("project lead", "a volunteer"), never people.

[`docs/status.md`](docs/status.md) says where things stand, and
[`docs/roadmap.md`](docs/roadmap.md) lists the next steps.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
