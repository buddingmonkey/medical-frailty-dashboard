# Deployment

Goal: **$0/month** while traffic is small, with a clear path to $5/month if we outgrow the free
tier. The limits below were correct when planned (2026-11). Check the
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) pages during M0.

## Cloudflare resources

| Resource | Production | Preview |
| --- | --- | --- |
| Worker (serves SPA + API) | `frailty-dashboard` | `frailty-dashboard-preview` |
| D1 database | `frailty-prod` | `frailty-preview` |
| R2 bucket | `frailty-prod-files` | `frailty-preview-files` |
| Access application | whole host until launch, then `/admin*` + `/api/admin*` | whole host, always |
| URL | `frailty-dashboard.<subdomain>.workers.dev` (custom domain later) | `frailty-dashboard-preview.<subdomain>.workers.dev` |
| Bindings | `DB` (D1), `FILES` (R2) | same |

Workers preview URLs (per-version URLs) stay **off**, or behind Access, so no unprotected copy of
the site exists.

Workers Logs and Traces are on (`observability` in `wrangler.jsonc`; free plan: 200,000 log
events a day, kept 3 days). Query strings are redacted. Errors are logged as one JSON line.

Worker variables (`wrangler.jsonc`): `ENVIRONMENT`, `SITE_MODE` (`private` on both Workers
until launch), `AI_MODEL` (later). `DEV_ADMIN_EMAIL` exists only locally (`pnpm dev` sets it to
`dev@localhost`).

Worker secrets:

| Secret | Set by | Notes |
| --- | --- | --- |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | CI, on every deploy (`--secrets-file`), from the GitHub environment's **variables** | Not sensitive, but kept out of the repo so a new host changes them without a code change. While unset, every gated request is a 401 |
| `ADMIN_EMAILS` | The project lead, once per Worker: `pnpm cf secret put ADMIN_EMAILS --env preview`, and without `--env` for production | Comma-separated. Prompts for the value, so it never lands in the repo or a chat |
| `ANTHROPIC_API_KEY` | Optional, not set | Turns on the "Ask Claude" button in AI cleanup. Set a monthly spend limit in the Anthropic Console first. `AI_MODEL` (optional variable) picks the model; default `claude-opus-5-5` (`apps/api/src/ai/claude.ts`) |

Local values go in `apps/api/.dev.vars` (gitignored; `.dev.vars.example` is committed).

### Cloudflare account and Access (set up in M0 step 7)

- A **dedicated Cloudflare account** for this project (not shared with other projects), so the
  site can be handed to an organization later and API tokens only reach this project.
- A Zero Trust team (Free plan; its name is the `ACCESS_TEAM_DOMAIN` variable), Google as the only identity provider.
- Reusable Access policy **"Frailty Dashboard Access"**: Allow, the admins' emails. Guest
  testers (M8) are added here.
- Access applications (self-hosted, whole host, 24 h session, Google auto-redirect):
  "Frailty Dashboard (preview)" and "Frailty Dashboard (production)". Each also has a Service
  Auth policy for its CI service token (`ci-smoke-preview`, `ci-smoke-prod`, 1-year expiry:
  renew by November 2027).
- workers.dev hosts have no zone, so there are no bot settings to change until a domain is
  added ("Going live", step 6).

### GitHub environments

| | `preview` | `production` |
| --- | --- | --- |
| Who can deploy | `main` only | `main` and `v*` tags, after the required reviewer (project lead) approves |
| Secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | same names, own values |
| Variables | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `SITE_URL` | same names, own values |

Each environment has its own CI API token ("Edit Cloudflare Workers" template plus D1 Edit and
R2 Edit, this account only), so either can be revoked alone. Cloudflare API tokens can be
limited to an account, not to single Workers, databases or buckets.

### Local Cloudflare access

`wrangler login` is global to the computer, so this repo uses its own token instead:
`apps/api/.env.cloudflare` (gitignored) with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` (a token named `mfcd-local`, same permissions as CI's). Run wrangler
through `pnpm cf <args>` (`scripts/cf.ts`), which loads that file. It **refuses any `deploy` or
`rollback` without `--env preview`**: production changes code only from CI.
`pnpm deploy:preview` builds the site and deploys the preview Worker.

## Cost

| Item | Free tier | When we'd pay |
| --- | --- | --- |
| Workers | 100k requests/day, 10 ms CPU per request. Static asset requests are free and unlimited | > 100k API requests/day, or CPU-heavy requests (big chunk uploads). **Workers Paid: $5/month** (10M requests, 30 s CPU per request), and it raises the D1 limits too |
| D1 | 5 GB, 5M rows read/day, 100k rows written/day, 7-day Time Travel | Paid plan: 30-day Time Travel and much larger quotas |
| R2 | 10 GB storage, 1M writes, 10M reads/month, no egress fees | Unlikely: source PDFs + backups are well under 1 GB |
| Cloudflare Access | Free for up to 50 users | Never, for a few admins |
| GitHub (public repo) | Unlimited Actions minutes, CodeQL, Dependabot | Never |
| Domain (optional) | — | ~$10/year at Cloudflare Registrar (at cost) |
| Claude API (optional) | — | Pay per token, only when the admin clicks the AI cleanup button. Set a spend limit. **Estimate, not measured:** with `claude-opus-5-5` ($4 in / $20 out per million tokens, 2026-10) Nebraska's 295 pages ≈ 0.2M tokens in and ≈ 0.25M out ≈ **$5–6 per full file**; a cheaper model via `AI_MODEL` is the project lead's call. Measure the first real run and write it here |

**Expected: $0/month** (plus ~$10/year if you buy a domain). Size estimate: 50 states ×
~5,000 entries ≈ 250k rows ≈ well under 500 MB in D1. A full re-ingest of one large state
(≈ 6,000 rows plus FTS and index writes) fits inside the daily write quota. Load a few states
per day if bulk-seeding many.

**Reference codes** (`ref_codes`, 107,173 rows of ICD-10-CM and HCPCS) are larger than one
day's free write quota, which preview and production share. The loader works in chunks and
resumes, so the first load takes about **two days per database** at $0; later updates load
only changed codes (`packages/reference-data/README.md`). Entries carry three indexes plus the
FTS index. **Measured on preview (2026-11-02, `wrangler d1 insights`): 4.3 rows written per
entry** (109,486 rows written for 25,338 entries). GA's 6,173 entries ≈ 27k writes, NE's 8,183 ≈
35k, all four seed states ≈ 74k. On Free (from 2026-11-30, 100k writes a day shared by preview
and production) that is one full load a day; a re-load of a large state the same day can hit
the limit, and queries then fail until 00:00 UTC. Discarded drafts keep their rows (storage, not
writes).

Watch for: a publish that writes > 100k rows in one day (free tier), and search traffic that
misses the cache. Turn on a Cloudflare usage notification. If either becomes a problem, switch
to Workers Paid ($5/month) rather than re-architecting.

## Environments and CI/CD

| Trigger | What happens |
| --- | --- |
| PR | `pnpm check:full`, CodeQL, gitleaks, audit. No deploy |
| Merge to `main` | Checks, then `deploy preview` (`.github/workflows/deploy.yml`): build, deploy with the Access secrets, smoke test |
| Release tag `v*` (manual, on a commit in `main`) | Checks, then `deploy production` waits for the project lead's approval, then the same steps |

The smoke test calls `/api/public/health` with the environment's service token (expects
`ok: true`, the right `environment` and `X-Robots-Tag: noindex`), then checks that a request
without a token is redirected to the Access login. Before deploying, the job records the D1
Time Travel bookmark (shown in the run summary, with the restore command) and runs
`wrangler d1 migrations apply DB --remote` (since M1 step 6), for preview and production alike.

**Reference codes** load through a separate manual workflow, **Reference data**
(`.github/workflows/reference-data.yml`): pick the environment and a row budget (default
80,000), and run it again on later days until it reports nothing left. A production run waits
for the same approval as a production deploy, and never runs at the same time as a deploy of
that environment. Preview can also be loaded locally with
`pnpm --filter @mfcd/reference-data load --env preview`; production cannot.

### Preview data

Production holds the real lists, and admins edit them there. Preview is for checking that the
software works, so it holds seed data (project lead, 2026-11-02).

The four states were first loaded on preview (M2 step 11). A one-time manual workflow,
**Copy state data** (`.github/workflows/copy-state-data.yml`, `scripts/copy-state-data.ts`),
moves them to production. It also waits for the production approval.

- **What it refuses:** it copies only into an empty target, so it stops if any copied table
  already has rows. It also stops if the unified category ids or slugs differ between the two
  databases.
- **What it copies:**
  - the R2 source files, each checked by SHA-256;
  - the state tables: sources, versions, parts, entries, mappings, similarity and audit;
  - the states' list columns;
  - a `data_version` bump and one `data.copy` audit row.
- **What it checks:** afterwards, it compares row counts and the search index.
- **Dry run:** `node scripts/copy-state-data.ts --to local --persist-to <dir>` copies into a
  fresh local D1. Apply migrations to `<dir>` first. Production is a target only inside
  GitHub Actions.
- **Measured:** 52 s for 25,173 entries (2026-11-02). The local copy matched preview on row
  counts, check-report length, entry checksums and states.

**What we learned from the copy:**

- `wrangler d1 export --table <name>` works on a database that has `entries_fts`. Only a
  whole-database export refuses it.
- An export prints a signed download link that stays valid for an hour, and the rows hold admin
  emails. The script therefore never prints wrangler's output.
- A check report can be 717 KB, but a D1 statement holds about 100 KB at most. So
  `dataset_versions` is copied from query rows instead of the export, and the report is
  written back in 20,000-character pieces.
- A `run:` step only gets `pipefail` when it sets `shell: bash`. Without it, `| tee` hides a
  failure.

- The deploy job uses the environment's own Cloudflare API token (see "GitHub environments").
- **Never edit a migration after a remote database has applied it** (from M1 step 6 on). Until
  then, M1 regenerated `0000_init` twice (no remote D1 had applied it).
- **Changing a CHECK constraint makes drizzle-kit rebuild the table** (create a copy, copy the
  rows, drop the old table, rename). Dropping `entries` also drops the FTS triggers, silently.
  Any migration that rebuilds `entries` must recreate the three triggers from
  `0001_entries_fts.sql` and run `INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')`. The
  FTS tests in `apps/api/src/db/schema.test.ts` fail if the triggers are missing.
- Migrations must be backward-compatible with the previous Worker version (add columns and
  tables first, drop them in a later release), because migrations run before the new code is live.
- Rollback a bad deploy: `wrangler rollback` to the previous Worker version (data is not
  touched). Rollback bad data: see "Backups and restore".

## Backups and restore

| Backup | How | Kept |
| --- | --- | --- |
| Before every publish | The Worker writes the state's current published version as JSON to R2 (`backups/<state>/<version id>.json`: version row, sources, parts, entries; `apps/api/src/db/backup.ts`). Built in M2 step 8 | 20 per state (pruning not built yet) |
| Weekly full dump | Worker Cron Trigger (Sunday) → JSON of every table to R2 `backups/weekly/` | 12 weeks |
| Before each production deploy | CI records the D1 Time Travel bookmark (`wrangler d1 time-travel info`) in the deploy log, then migrates. Not `wrangler d1 export`: it refuses databases with virtual tables, and `entries_fts` is one (user, 2026-11-01) | 7 days (Time Travel window) |
| Manual download | Admin page "Download backup" → `GET /api/admin/backup` streams JSON to the admin's computer | Your computer |
| Point in time | D1 Time Travel (`wrangler d1 time-travel restore`) | 7 days free / 30 days paid |

Restore paths, from smallest to largest:

1. **One state wrong:** admin → state → versions → roll back (no backup needed).
2. **A state's history lost:** admin → import backup JSON for that state → goes through the
   normal draft → checks → publish flow.
3. **Whole database bad:** `wrangler d1 time-travel restore frailty-prod --timestamp=<before>`,
   (or `--bookmark=<from the deploy log>`), or rebuild a new D1 from the latest weekly JSON
   dump. `wrangler d1 export` works only after dropping `entries_fts` (recreate it and run
   `INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')` afterwards).

Test restore path 2 in E2E, and do a path 3 drill on the preview database once before launch.

## Going live

Before launch (M8), with everything below checked off in `docs/status.md`:

1. Launch gate met (`docs/roadmap.md`, M8): at least 2 states with every category mapping
   confirmed, the usability gate passed, and the disclaimer and CPT notice reviewed.
2. `security-review` run and findings closed; Playwright smoke passes against preview with
   `SITE_MODE=public`.
3. Change the production Access application from the whole host to `/admin*` and
   `/api/admin*` only.
4. Set `SITE_MODE=public` on production and deploy (this removes `noindex` and the disallow-all
   `robots.txt`).
5. Run the production smoke spec: public pages return 200; `/admin` and `/api/admin/*` return
   401/redirect without login.
6. Check Cloudflare's bot settings for the final host (they exist only once there is a domain): "Block AI bots" / managed robots.txt
   off, AI Crawl Control set to allow, verified crawlers not challenged (`docs/seo.md`).
7. Serve hashed static files without the Worker: in `apps/api/wrangler.jsonc` change
   `run_worker_first` from `true` to `["/*", "!/assets/*"]`, and add `apps/web/public/_headers`
   with `/assets/*` rules for `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`
   and `Cross-Origin-Resource-Policy: same-origin` (CSP matters only on HTML, which still goes
   through the Worker). This cuts Worker requests to about 1 per page view.
8. Domain: the project lead buys one (~$10/yr), or the site is handed to an organization that
   hosts it on its own domain. Nothing may hard-code the `workers.dev` host. Then add it as a
   Worker custom domain, move the Access application to the new host name, add the `Sitemap:`
   line to `robots.txt`, and optionally turn on WAF/Bot Fight Mode (re-check step 6: verified
   crawlers must not be challenged).

To take the site private again, do steps 4 then 3 in reverse.
