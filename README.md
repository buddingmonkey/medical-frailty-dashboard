# Medical Frailty Coding Dashboard

Compare the medical codes each US state uses to decide who is **"medically frail"** and so
exempt from the new Medicaid work requirements.

> **Status: in development, not yet public.** The map, compare, state and code pages and the
> admin tools work; the real lists are loaded on the private production site, which stays
> behind a pre-launch gate until the launch checks pass. Start with
> [`docs/status.md`](docs/status.md) and [`docs/roadmap.md`](docs/roadmap.md).

## Why this exists

H.R.1 (2025) requires many adults on Medicaid to meet work or "community engagement"
requirements starting January 1, 2027. People who are medically frail are exempt. Each state
defines frailty with its own list of diagnosis, procedure and service codes (ICD-10-CM, CPT,
HCPCS and others), and publishes it in its own format: spreadsheets, web pages, and PDFs
that run to hundreds of pages.

That makes it hard to answer simple questions:

- Which states treat a given diagnosis as frailty?
- How does one state's list of substance use disorder codes compare with another's?
- Does a code qualify on its own, or only together with another code?

This site puts every state's list in one place, in one format, with links back to the state's
own documents.

## Who it is for

- State Medicaid directors and their staff
- Health care providers and provider associations
- Health care advocates and legal aid organizations

## Features

- **US map:** every state's status, number of codes, code types and list date at a glance.
- **Compare by category:** pick a category (for example, substance use disorder) and any
  number of states to see their codes side by side.
- **Code search:** search by code or name to see which states list it, and which list a
  similar code in a different coding system.
- **Admin tools** (login required): load new or updated state lists from PDF, Excel or JSON
  with checks that stop a wrong file, fix category mappings, roll back, back up, and track
  legal and policy deadlines.

## How it is built

| Part | Technology |
| --- | --- |
| Website | Vue 3, TypeScript, Tailwind CSS, Vite |
| API | TypeScript ([Hono](https://hono.dev)) on Cloudflare Workers |
| Database and files | Cloudflare D1 (SQLite) and R2 |
| Admin login | Cloudflare Access with Google |
| Tests | Vitest, Testing Library, Playwright, axe |

Hosting is designed to cost about **$0/month** on Cloudflare's free tier. See
[`docs/deployment.md`](docs/deployment.md).

### Built with an AI assistant

This project is being built by a small team with the help of an AI coding assistant
(Claude Code). We keep a record of how, including where the AI and the humans got
things wrong, so other organizations can learn from it:

- [`docs/devlog/`](docs/devlog/README.md): session-by-session development log
- [`docs/getting-started.md`](docs/getting-started.md): first-time setup for people who have never used a terminal (GitHub, Windows WSL, Claude Code, the site on your computer)
- [`docs/playbook.md`](docs/playbook.md): how to make a change and send it as a pull request, for less-technical builders

## Documentation

| Doc | What it covers |
| --- | --- |
| [getting started](docs/getting-started.md) | First-time setup, for non-technical contributors |
| [status](docs/status.md) | Where things stand, decisions, open questions, dates to watch |
| [roadmap](docs/roadmap.md) | Milestones and the launch gate |
| [design wiki](docs/MedicalFrailtyCode-design-wiki.md) | Product goals and features |
| [architecture](docs/architecture.md) | Stack, layout, API |
| [data model](docs/data-model.md) | Tables, code formats, categories, qualification |
| [ingestion](docs/ingestion.md) | Loading and updating state lists safely |
| [sources](docs/sources.md) | Each state's documents, and relevant court rulings and federal guidance |
| [security](docs/security.md) | Threat model and protections |
| [testing](docs/testing.md) | How the site is tested |
| [deployment](docs/deployment.md) | Hosting, costs, backups, going live |

## Getting started (developers)

**New to terminals, Git or Claude Code?** Start with
[`docs/getting-started.md`](docs/getting-started.md), then [`docs/playbook.md`](docs/playbook.md).
Windows needs WSL: the project's scripts need Linux.

Already comfortable? You need Node 26 (`.nvmrc`) and pnpm 12.16.1 (`npm i -g pnpm@12.16.1`).

```bash
pnpm install
pnpm db:migrate:local && pnpm db:ref:local && pnpm db:seed:local   # local database, ~1.5 min
pnpm dev          # the whole site on http://localhost:8787
pnpm check        # format, lint, types, unit, component and API tests, plus db-drift, refdata and scripts
pnpm --filter @mfcd/web exec playwright install --with-deps chromium   # once, for pnpm check:full
pnpm check:full   # plus the build and browser tests (CI runs it on every pull request)
```

After `pnpm dev` starts, open Admin, Unified categories (`/admin/unified`) and press
**Rebuild coverage** once, so Compare and the Map fill in.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow and rules, and
[`SECURITY.md`](SECURITY.md) to report a vulnerability.

## Data, accuracy and disclaimer

- All data comes from documents the states publish. Every state page will link to its sources
  and show the date the list was published and loaded.
- **This site is not legal or medical advice and is not an official source.** Always check
  with the state Medicaid agency.
- The site contains **no patient or member data**, and is designed never to hold any.
- CPT® codes and descriptions are copyright the American Medical Association. Descriptions are
  shown only as published by each state, with a citation. ICD-10-CM and HCPCS Level II are in
  the public domain.

Found a data error? [Open a data error issue](../../issues/new?template=data-error.yml) with
the state, the code and a link to the state's document.

## License

Code: [MIT](LICENSE). State code lists remain the publications of their respective states.
