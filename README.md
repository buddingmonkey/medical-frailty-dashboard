# Medical Frailty Coding Dashboard

Compare the medical codes each US state uses to identify Medicaid members who may be
**"medically frail"**, and so excluded from the new Medicaid work requirements.

> **Status: in development, not yet public.** The lists of four states (GA, LA, MT, NE) are loaded, but the site
> stays behind a sign-in until the launch checks pass. [`docs/status.md`](docs/status.md) says
> where things stand.

## Why this exists

H.R.1 (Pub. L. 119-21, §71119, 2025) requires many adults on Medicaid to meet work or "community engagement"
requirements starting January 1, 2027. People who are medically frail are excluded. Each state
publishes its own list of codes it uses to identify medically frail members: diagnosis codes (ICD-10-CM), procedure codes (CPT)
and service and supply codes (HCPCS), among others. Each state also publishes its list in its
own format: spreadsheets, web pages or PDFs that run to hundreds of pages.

That makes simple questions hard to answer:

- Which states treat a given diagnosis as frailty?
- How does one state's list of substance use disorder codes compare with another's?
- Does a code count on its own, or only together with another code?

This site puts every state's list in one place, in one format, with links back to the state's
own documents.

## Who it is for

- State Medicaid directors and their staff
- Health care providers and provider associations
- Health care advocates and legal aid organizations
- Policy researchers and journalists

## What it does

- **US map:** each state's status, number of codes, code types and list date.
- **Compare:** pick a category (for example, substance use disorder) and see how much of it
  each state lists, code by code, or put two to four states side by side.
- **Code search:** search by code or by words to see which states list a code, and which list
  a similar code from a different coding system.
- **Code pages:** one page per code, with each state's answer in a plain sentence and a link to
  the state's document.
- **Downloads:** each state's list as CSV or JSON.
- **Admin tools** (sign-in required): load new or updated state lists from PDF, Excel, CSV or JSON,
  with checks that stop a wrong file; fix category mappings; roll back; back up; and track
  legal and policy deadlines.

## Data, accuracy and disclaimer

- All data comes from documents the states publish. Each state page links to its sources and
  shows when the list was published and loaded.
- **This site is not legal or medical advice and is not an official source.** It does not
  decide anyone's eligibility. Check with the state Medicaid agency.
- The site holds **no patient or member data**, and is designed never to hold any.
- CPT® codes and descriptions are © American Medical Association. The site shows
  CPT descriptions only as each state published them, with a citation. ICD-10-CM and HCPCS
  Level II are in the public domain.

Found a wrong code? [Report a data error](../../issues/new?template=data-error.yml) with the
state, the code and a link to the state's document.

## How it is built

| Part | Technology |
| --- | --- |
| Website | Vue 3, TypeScript, Tailwind CSS, Vite |
| API | TypeScript ([Hono](https://hono.dev)) on Cloudflare Workers |
| Database and files | Cloudflare D1 (SQLite) and R2 |
| Admin sign-in | Cloudflare Access with Google |
| Tests | Vitest, Testing Library, Playwright, axe |

Hosting costs $5 a month (Cloudflare Workers Paid); the rest fits in Cloudflare's free
allowances. See [`docs/deployment.md`](docs/deployment.md).

### Built with an AI coding assistant

A small team is building this site with Claude Code, an AI coding assistant. We record how,
including where the AI and the people got things wrong, so other organizations can learn from
it:

- [`docs/devlog/`](docs/devlog/README.md): what happened in each working session
- [`docs/getting-started.md`](docs/getting-started.md): first-time setup for people who have
  never used a terminal
- [`docs/playbook.md`](docs/playbook.md): how to make a change and send it to the project

## Help with the code

New to terminals, Git or Claude Code? Start with
[`docs/getting-started.md`](docs/getting-started.md), then [`docs/playbook.md`](docs/playbook.md).
Windows (PowerShell), macOS and Linux all work.

Already comfortable? You need Node 26 (`.nvmrc`) and pnpm 12.16.1 (`npm i -g pnpm@12.16.1`).
The same commands work in PowerShell, cmd and bash:

```text
pnpm install
pnpm db:migrate:local   # local database (these three take about 1.5 min)
pnpm db:ref:local
pnpm db:seed:local
pnpm dev          # the whole site on http://localhost:8787
pnpm check        # format, lint, types, unit, component and API tests, and more
pnpm --filter @mfcd/web exec playwright install --with-deps chromium   # once, for pnpm check:full
pnpm check:full   # adds the build and browser tests (CI runs it on every pull request)
```

After `pnpm dev` starts, open Admin, Unified categories (`/admin/unified`) and press
**Rebuild coverage** once, so Compare and the map fill in.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow and rules, and
[`SECURITY.md`](SECURITY.md) to report a vulnerability.

## Documentation

| Doc | What it covers |
| --- | --- |
| [Getting started](docs/getting-started.md) | First-time setup, for non-technical contributors |
| [Playbook](docs/playbook.md) | Making a change with Claude Code and sending a pull request |
| [Adding a state's list](docs/add-state-source.md) | The admin steps, for admins |
| [Status](docs/status.md) | Where things stand, decisions, open questions |
| [Roadmap](docs/roadmap.md) | Milestones and the launch gate |
| [Design wiki](docs/MedicalFrailtyCode-design-wiki.md) | Product goals and features |
| [Sources](docs/sources.md) | Each state's documents, and the court rulings and federal guidance |
| [Legal review](docs/legal-review.md) | Provisional wording for the legal team |
| [Architecture](docs/architecture.md) | Stack, layout, API |
| [Data model](docs/data-model.md) | Tables, code formats, categories, qualification |
| [Ingestion](docs/ingestion.md) | Loading and updating state lists safely |
| [Security](docs/security.md) | Threat model and protections |
| [Testing](docs/testing.md) | How the site is tested |
| [Deployment](docs/deployment.md) | Hosting, costs, backups, going live |

## License

Code: [MIT](LICENSE). State code lists remain the publications of their states.
