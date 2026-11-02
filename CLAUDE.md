# Medical Frailty Coding Dashboard

A public site that compares the code lists US states use to mark Medicaid members as
"medically frail" (an exemption from the H.R.1 work requirements). Vue 3 + Tailwind on the
front end, a TypeScript API on Cloudflare Workers, D1 (SQLite) for data, R2 for source files.
All data is public state policy. There is no patient data, and there never will be.

> **Status: M2 in progress (ingestion admin).** Every command below works except
> `db:seed:local` and the seeded `e2e`, which are not built yet. `docs/status.md` says what exists.

## Commands

```bash
pnpm check            # lint, typecheck, unit + component + API tests, one line per stage; run after every change
pnpm check:full       # pnpm check + build + Playwright e2e + axe; run before merging to main
pnpm dev              # Vite + wrangler dev (local D1/R2) on http://localhost:8787
pnpm dev:stop         # stop everything pnpm dev started (never pkill; wrangler respawns workerd)
pnpm test <filter>    # run matching Vitest tests in every workspace (no `--`: it disables the filter)
pnpm e2e              # Playwright against a local build with seeded D1
pnpm db:generate      # after editing apps/api/src/db/schema.ts: write a migration, then review it
pnpm db:migrate:local # apply D1 migrations to the local database
pnpm db:ref:local     # load the CMS reference codes (ICD-10-CM, HCPCS) into local D1, ~20 s
pnpm db:seed:local    # load the fixture states (GA, LA, MT, NE) into local D1
pnpm format           # prettier --write
pnpm deploy:preview   # deploy to the preview Worker (always behind Cloudflare Access)
pnpm cf <args>        # wrangler with this repo's own token (apps/api/.env.cloudflare); refuses prod deploys
```

Production deploys happen only from CI, on a `v*` tag of a `main` commit, after the project lead
approves. Never run `wrangler deploy` against production by hand.

## Rules

- **TypeScript strict everywhere.** No `any`, no `@ts-ignore`. Validate every API input and
  every ingested row with the zod schemas in `packages/shared`.
- **Vue:** `<script setup lang="ts">`, Composition API, `defineModel` for v-model, and no
  `v-html` with data. Follow the `vue-development` skill for structure and tests.
- **Test first.** Write the failing test, implement, run `pnpm check`. See `docs/testing.md`.
- **No patient data.** Never add a field, upload path or log line that could hold a member's
  name, ID or claim. The site compares code lists only.
- **CPT descriptions:** show only the text the state published, with its source citation. Never
  add an AMA CPT descriptor table. See `docs/data-model.md` ("Licensing of code text").
- **Admin is behind Cloudflare Access**, and the API also checks the Access JWT. Never add an
  admin route outside `/admin` or `/api/admin`. See `docs/security.md`.
- **Secrets** go in `wrangler secret` or `.dev.vars` (gitignored). The repo is public.
- **Builders are optional.** The main session plans with the project lead, and reviews,
  writes the devlog and opens the PR. It may hand one approved step to the `builder` agent
  (`.claude/agents/builder.md`): one step per builder, commit and stop. Builders use the main
  session's model; pass Sonnet only for pure rote work (doc edits, search, mechanical refactors).
- Do not read a large doc in full. `grep -n` for the section, then read that range.
- **Keep the devlog.** At the end of every session that changed the plan or code, and at
  every milestone, add an entry to `docs/devlog/` (template in its README). Promote lessons to
  `docs/playbook.md` and notable moments and numbers to `docs/talk-notes.md`. The repo is
  public: roles, not names or emails.
- When you learn something about a state's data or the federal rules, add it to
  `docs/sources.md` or `docs/MedicalFrailtyCode-design-wiki.md`.

## Docs

Read the doc that matches the task. Do not load all of them.

| Read this | When you need |
| --- | --- |
| [docs/status.md](docs/status.md) | **Read first.** Where things stand, open questions, how the user likes to work |
| [docs/roadmap.md](docs/roadmap.md) | Milestones and steps, with acceptance checks |
| [docs/MedicalFrailtyCode-design-wiki.md](docs/MedicalFrailtyCode-design-wiki.md) | Product goals, users and features (the user's spec) |
| [docs/architecture.md](docs/architecture.md) | Stack, repo layout, request flow, API shape, caching |
| [docs/data-model.md](docs/data-model.md) | Tables, code normalization, wildcards/ranges, categories, "like" codes, glossary |
| [docs/ingestion.md](docs/ingestion.md) | Upload, parse, review, map and publish flow; parser adapters; AI cleanup |
| [docs/sources.md](docs/sources.md) | Each state's source documents, format quirks and category list |
| [docs/add-state-source.md](docs/add-state-source.md) | Adding or updating a state's list through the admin screens, step by step |
| [docs/security.md](docs/security.md) | Threat model, Access setup, pre-launch gate, headers, upload safety |
| [docs/seo.md](docs/seo.md) | SEO and GEO rules: server-rendered HTML, URLs, structured data, sitemap, crawlers |
| [docs/testing.md](docs/testing.md) | Test layers, tools, fixtures, how to add and run tests |
| [docs/deployment.md](docs/deployment.md) | Cloudflare setup, environments, CI/CD, costs, backups, going live |
| [docs/devlog/](docs/devlog/README.md) | How the site was built, session by session; entry template |
| [docs/playbook.md](docs/playbook.md) | Step-by-step guide for less-technical builders adding to the site |
| [docs/talk-notes.md](docs/talk-notes.md) | Story, moments and numbers for a future blog post or talk |
