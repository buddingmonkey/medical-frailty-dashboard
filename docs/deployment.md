# Deployment

Goal: keep running costs near $0. The account is on Workers Paid ($5/month) since 2026-11-01;
everything else fits the free allowances. The limits below were checked in 2026-11; see the
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and
[R2 pricing](https://developers.cloudflare.com/r2/pricing/) pages for current numbers.

## Cloudflare resources

| Resource | Production | Preview |
| --- | --- | --- |
| Worker (serves SPA + API) | `frailty-dashboard` | `frailty-dashboard-preview` |
| D1 database | `frailty-prod` | `frailty-preview` |
| R2 bucket | `frailty-prod-files` | `frailty-preview-files` |
| Access application | whole host until launch, then `/admin*` + `/api/admin*` | whole host, always |
| URL | `frailty-dashboard.<subdomain>.workers.dev` (custom domain later) | `frailty-dashboard-preview.<subdomain>.workers.dev` |
| Bindings | `DB` (D1), `FILES` (R2), `PUBLIC_RATE_LIMITER` and `SEARCH_RATE_LIMITER` (rate limits, `docs/security.md`) | same (own rate-limit namespaces) |

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
| Variables | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `SITE_URL`, `D1_DATABASE_ID`; optional `CF_BEACON_TOKEN` | same names, own values |

`D1_DATABASE_ID` is the environment's D1 database id (`pnpm cf d1 list`). The ids are not
secret, but they are not committed: `apps/api/wrangler.jsonc` holds the placeholders
`local-frailty-prod` and `local-frailty-preview`, which local dev and tests use, and each
workflow that touches a remote database (Deploy, Reference data, Copy state data) first runs
`node scripts/d1-ids.ts --<environment> "$D1_DATABASE_ID"` to write the real id into its own
checkout. The job stops with an error if the variable is unset. Copy state data runs in
`production` and looks up preview's id by the name `frailty-preview`.

`CF_BEACON_TOKEN` turns on Cloudflare Web Analytics for that environment (below). Unset means
analytics off, never a failed deploy.

Each environment has its own CI API token ("Edit Cloudflare Workers" template plus D1 Edit and
R2 Edit, this account only), so either can be revoked alone. Cloudflare API tokens can be
limited to an account, not to single Workers, databases or buckets.

### Web Analytics

Cloudflare Web Analytics (roadmap M8 step 6) counts page views and page load times. It is free,
sets no cookies and stores nothing in the browser, so it needs no consent banner. It needs no
domain: the "manual setup" works on a `workers.dev` host.

**How it is wired.** The Worker var `CF_BEACON_TOKEN` holds the site token. It is not a secret:
the token is in every page. `apps/api/wrangler.jsonc` sets it to `""` (off) for local dev and
tests; the Deploy workflow passes the GitHub environment variable of the same name with
`wrangler deploy --var CF_BEACON_TOKEN:<token>` when it is set, and stops with an error if it is
set but is not 32 hex characters. With a token, `apps/api/src/seo/analytics.ts` adds
`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "…"}'>`
to the `<head>` of every public HTML page (the Worker's rendered pages and the SPA shell), and
the CSP allows `https://static.cloudflareinsights.com` in `script-src` and
`https://cloudflareinsights.com` (where the beacon posts to `/cdn-cgi/rum`) in `connect-src`.
Admin pages never get the script, and their CSP stays strict. Tests:
`apps/api/src/seo/analytics.test.ts`.

**Turning it on (project lead, once per environment):**

1. Cloudflare dashboard, this account: **Analytics & Logs → Web Analytics → Add a site**.
2. Enter the environment's host name (for example the preview `workers.dev` host from
   `SITE_URL`, without `https://`) and choose **manual setup** (not the automatic setup, which
   needs a proxied zone).
3. Copy the token from the snippet it shows: the value of `"token"` in `data-cf-beacon`
   (32 hex characters).
4. GitHub: **Settings → Environments → `preview`** (or `production`) **→ Environment variables
   → Add variable**, name `CF_BEACON_TOKEN`, value the token.
5. Deploy: the next push to `main` (preview) or the next release tag (production). Open a public
   page, check the page source has the beacon script, and wait a few minutes for the first page
   views in the dashboard.

Preview sits behind Access, so its numbers only count testers. Register production separately:
the token is tied to its host name.

**When the domain arrives:** the token belongs to the host name it was registered for (an apex
match, so `www.` and the bare domain share one). Add a new site for the new domain, put its token
in `CF_BEACON_TOKEN` for `production`, deploy, and delete the old `workers.dev` site in the
dashboard. To turn analytics off, delete the variable and deploy.

### Local Cloudflare access

`wrangler login` is global to the computer, so this repo uses its own token instead:
`apps/api/.env.cloudflare` (gitignored) with `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` (a token named `mfcd-local`, same permissions as CI's). Run wrangler
through `pnpm cf <args>` (`scripts/cf.ts`), which loads that file. It **refuses any `deploy` or
`rollback` without `--env preview`**: production changes code only from CI.

The same file holds the D1 ids for commands from a laptop, since `wrangler.jsonc` has only
placeholders: `D1_PREVIEW_DATABASE_ID=<preview id>` (needed for anything with `--env preview`,
such as `pnpm db:seed:preview` and the preview reference load) and, optionally,
`D1_PRODUCTION_DATABASE_ID=<production id>` for read-only queries. `pnpm cf` writes a gitignored
copy, `apps/api/wrangler.local-ids.jsonc`, with those ids and passes it as `--config` (unless you
pass your own). Only the two `D1_*` keys are read for this.
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

**Current: $5/month** for Workers Paid, which the project lead keeps (2026-11-02; the weekly
dump needs it), plus ~$10/year if a domain is bought. Everything else fits the free
allowances. Size estimate: 50 states ×
~5,000 entries ≈ 250k rows ≈ well under 500 MB in D1. A full re-ingest of one large state
(≈ 6,000 rows plus FTS and index writes) fits inside the daily write quota. Load a few states
per day if bulk-seeding many.

**Reference codes** (`ref_codes`, 107,173 rows of ICD-10-CM and HCPCS) are larger than one
day's free write quota, which preview and production share. The loader works in chunks and
resumes, so the first load takes about **two days per database** at $0; later updates load
only changed codes (`packages/reference-data/README.md`). Entries carry three indexes plus the
FTS index. **Measured on preview (2026-11-02, `wrangler d1 insights`): 4.3 rows written per
entry** (109,486 rows written for 25,338 entries). GA's 6,173 entries ≈ 27k writes, NE's 8,183 ≈
35k, all four seed states ≈ 74k. On the Free plan (100k writes a day shared by preview and
production) that is one full load a day; a re-load of a large state the same day can hit
the limit, and queries then fail until 00:00 UTC. Discarded drafts keep their rows (storage, not
writes).

Watch for search traffic that misses the cache, and keep a Cloudflare usage notification
on.

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

**Seed data.** `apps/api/seed/seed.sql` is committed. `pnpm db:seed:make` writes it. It only
reads, from production by default (the real lists live there) or from preview with
`-- --from preview`.

- **What's in it:**
  - **The real states** (GA, LA, MT, NE): up to 300 entries for each published list, as the
    states published them, with their sources and their category and unified mappings.
    Mappings keep their status.
  - **Every other state** gets a synthetic list (`scripts/synthetic-states.ts`), so the
    matrix, map and comparisons show 51 states: 40 published, 4 announced, 3 none.
- **How it samples the real states:**
  - Shared codes come first: codes two or more states list and that fall in a unified
    category. They fill at most half of each state's sample.
  - Then one entry per group in turn: code system, state category, subcategory and
    qualification.
  - Picks spread evenly over the code range, so the sample isn't all from chapter A.
- **How it makes a synthetic list:**
  - It is deterministic: one seeded PRNG per state id.
  - The entries are code patterns from the four full real lists: exact codes, wildcards and
    ranges, plus the 3-character category of any pool code whose category the pool lacks.
    `description_published` is NULL, so no state's text (CPT in particular) is copied.
  - For each unified category it picks a band (high, mid, low or none) and takes entries until
    the share of the category's full code list falls inside that band. Categories without a
    full list (frailty indicators) take a share of 60 HCPCS, CPT, revenue and drug-class codes.
  - Category names are one list without categories (like GA) or realistic names per category,
    sometimes with subcategories. Qualification is all standalone, tiered, all unknown, or
    partly supporting-only.
  - About 70% of state categories get an approved `exact` unified mapping, so some cells show
    "not reviewed". Every named category gets a manual federal mapping.
  - One source per state, titled "Synthetic test list (seed data, not a real state list)", with
    no URL and R2 key `seed/<ST>`. Ids start at 1000 (sources, versions) and 1,000,000
    (entries). The generator stops if a real id reaches them.
- **What changes:** the 19 starter categories are published. Admin identities become
  `seed@localhost`, and the generator stops if any other email address is left. There's no
  reference data, and `check_report_json` is NULL.
- **Unified mappings** find their category by slug, because category ids differ between
  databases.

To load it:

1. Run `pnpm db:seed:local` or `pnpm db:seed:preview`. Either one **deletes every state list,
   mapping and audit row** in that database first. Reference data, states, unified categories
   and watch items stay. The script refuses any target except local and preview.
2. Press **Rebuild coverage** (Admin → Unified categories,
   `POST /api/admin/coverage/rebuild`). Seed SQL leaves the full code lists, placements and
   similarity empty, and the rebuild fills them.

Measured locally (2026-11-02), on 12,153 entries (1,200 real, 10,953 synthetic; 2.8 MB):

- loading the seed took about 3 s;
- the rebuild took 10.9 s and produced 3,538 codes in full lists, 12,369 placements and 946
  pairs;
- synthetic lists hold 135 to 353 entries (median 281);
- of the 836 cells of published states, 184 were high, 277 mid, 252 low and 123 none.
  Blindness and IDD never reach high: the real lists cover only 34% and 52% of their full
  code lists.

The first sampler took the first codes in code order, and only 118 of 480 entries were placed.

The R2 source files stay in preview's bucket, so local downloads answer 404.

**Banner.** Every HTML page of a Worker whose `ENVIRONMENT` is not exactly `production` opens
with a gold test-site banner (`apps/api/src/middleware/environment-banner.ts`).

- The banner is added when each page is served, not at build time, so both Workers run the
  same build.
- A missing or wrong value shows the banner rather than hiding it.

- The deploy job uses the environment's own Cloudflare API token (see "GitHub environments").
- **Never edit a migration after a remote database has applied it** (from M1 step 6 on). Until
  then, M1 regenerated `0000_init` twice (no remote D1 had applied it).
- **Changing a CHECK constraint makes drizzle-kit rebuild the table** (create a copy, copy the
  rows, drop the old table, rename). Dropping `entries` also drops the FTS triggers, silently.
  Any migration that rebuilds `entries` must recreate the three triggers from
  `0001_entries_fts.sql` and run `INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')`. The
  FTS tests in `apps/api/src/db/schema.test.ts` fail if the triggers are missing. The same
  holds for `ref_codes` and its three `ref_codes_fts` triggers (`0012_ref_codes_fts.sql`).
  `ref_codes_fts` is a regular FTS5 table with its own copy of the text, so `'rebuild'` does
  not apply to it. Instead, run `DELETE FROM ref_codes_fts` and then the backfill `INSERT`
  from 0012.
- Migrations must be backward-compatible with the previous Worker version (add columns and
  tables first, drop them in a later release), because migrations run before the new code is live.
- Rollback a bad deploy: `wrangler rollback` to the previous Worker version (data is not
  touched). Rollback bad data: see "Backups and restore".

## Backups and restore

| Backup | How | Kept |
| --- | --- | --- |
| Before every publish | The Worker writes the state's current published version as JSON to R2 (`backups/<state>/<version id>.json`, **format 1**: version row, sources (metadata, SHA-256, and since M7 step 1 file type and size), parts, entries; `apps/api/src/db/backup.ts`). Built in M2 step 8 | Newest 20 per state, by version id: the weekly maintenance deletes older ones and writes one `backup.prune` audit row per run with the counts. Built in M7 step 2 |
| Weekly full dump | Cron Trigger `0 7 * * SUN` (Sunday 07:00 UTC, both Workers; `triggers` in `wrangler.jsonc`) → `backups/weekly/<UTC date>.zip`: the same zip as the manual download (format 2, same writer) **plus each source's R2 key** (`storageKeys: true`), because it stays in R2 and restore path 3 needs the keys to find the source files. The zip is buffered in memory and put in one call (R2 needs a known length; a 32 MB cap, `WEEKLY_DUMP_MAX_BYTES`, fails the dump rather than the Worker). Listed on `/admin/restore`, with an admin-only download (`GET /api/admin/backup/weekly/:date`, audited `backup.weekly.download`). Built in M7 step 2 (`apps/api/src/maintenance/`) | Newest 12 (older ones deleted by the same run) |
| Before each production deploy | CI records the D1 Time Travel bookmark (`wrangler d1 time-travel info`) in the deploy log, then migrates. Not `wrangler d1 export`: it refuses databases with virtual tables, and `entries_fts` is one (user, 2026-11-01) | 7 days (Time Travel window) |
| Manual download | Admin → **Backup and restore** → "Download backup" → `GET /api/admin/backup` streams `frailty-backup-<env>-<UTC timestamp>.zip`: one deflated JSON file (**format 2**) with `format`, `writtenAt`, `environment`, `migration` (last applied), `dataVersion`, `notes`, every state-data table (`BACKUP_TABLES` in `packages/shared/src/backup.ts`) and `"complete": true` last. Written table by table, 500 rows per query (keyset on rowid), through a streaming zip (fflate); never whole in memory (`apps/api/src/db/backup-dump.ts`). Built in M7 step 1 | Your computer |
| Point in time | D1 Time Travel (`wrangler d1 time-travel restore`) | 7 days free / 30 days paid |

Restore paths, from smallest to largest:

1. **One state wrong:** admin → state → versions → roll back (no backup needed).
2. **A state's history lost:** admin → **Backup and restore** (`/admin/restore`) → pick a
   full download (`.zip`) or a per-publish backup (`.json`, from R2). The browser reads it
   (zod, `packages/shared/src/backup.ts`), shows what it holds, and the admin picks one state
   and one version. Its entries go to a **new draft** through the normal draft API (the same
   `validateDraftEntry` re-parse), then the normal checks → publish flow with all its guards.
   Each cited source is reused when the state still has a file with the same SHA-256;
   otherwise its title, URL and date are stored with no file (R2 key `restored/…`; its
   download answers 404 "file not available"), and the state page still cites it. The
   state's category mappings, chapter overrides and column profiles are replaced from a full
   backup only if the admin ticks the box, after a diff. Limits: 50 MB file and 50 MB of JSON
   inside a zip (checked while inflating), one `.json` entry per zip, 400,000 entries per
   version, formats 1 and 2 only. Audit: `backup.download`, `source.restore`,
   `draft.restore` (backup date, environment, version), `mappings.restore`.
3. **Whole database bad:** `wrangler d1 time-travel restore frailty-prod --timestamp=<before>`,
   (or `--bookmark=<from the deploy log>`), or rebuild a new D1 from the latest weekly dump
   (`/admin/restore` → Maintenance → Download, or `pnpm cf r2 object get
   <bucket>/backups/weekly/<date>.zip`): apply the migrations to an empty D1, then insert each
   table of the JSON in `BACKUP_TABLES` order. `source_documents.r2_key` is in the weekly dump,
   so each row points at its file, which is still in R2. Reload the reference codes and press
   Rebuild coverage. No script for this yet: write it during the pre-launch drill. `wrangler d1 export` works only after dropping `entries_fts` and `ref_codes_fts`.
   Afterwards, recreate both from 0001 and 0012, run
   `INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')`, and run 0012's backfill `INSERT`.

**Left out of the full backup** (also in its `notes`): reference tables (`ref_codes`,
`ref_ccsr`, `ref_ccsr_categories`: reload from the pinned files), derived tables
(`entry_unified`, `unified_universe`, `state_similarity`: Rebuild coverage recreates them), and
the FTS tables (`entries_fts`, `ref_codes_fts`). A test fails when a new table is in neither
list. Source files are not in it. The manual download leaves out their R2 keys
(`docs/security.md`); the weekly dump keeps them, and its download is admin-only like the rest.

**Measured on the local 51-state seed** (2026-11-03, `wrangler dev`): 13,735 rows (12,153
entries), 13,740 rows read in 44 queries, 5.4 MB of JSON, a 237 kB zip, about 0.3 s.

Restore path 2 has an E2E test (`apps/web/e2e/admin-restore.admin.spec.ts`). Do a path 3
drill on the preview database once before launch.

### Weekly maintenance

One function, `runMaintenance` (`apps/api/src/maintenance/maintenance.ts`), runs four parts in
order, each in its own try/catch so one failure never skips the rest: weekly dump → prune
weekly dumps (keep 12) → prune per-publish backups (keep 20 per state) → draft cleanup
(`docs/data-model.md`, "Replacing a state's list", step 6). The result (time, trigger, each
part's status, counts, timing and error message; never row data) goes to
`app_meta.last_maintenance`, shown on `/admin/restore` → **Maintenance**. The cron runs it as
`maintenance (cron)` in the audit log. **Run maintenance now** on the same page
(`POST /api/admin/maintenance`, audited `maintenance.run`) runs it by hand as the admin, so it
can be tried on preview on any day.

Trigger the cron locally:

```text
pnpm --filter @mfcd/web build
pnpm cf dev --test-scheduled --port 8791 --var ENVIRONMENT:development
curl "http://localhost:8791/__scheduled?cron=0+7+*+*+SUN"
```

In Windows PowerShell, type `curl.exe` (plain `curl` there is another command), or open the
link in a browser.

**Measured on the local 51-state seed** (2026-11-03): the dump read 13,778 rows in 44 queries,
wrote 5.4 MB of JSON as a 237 kB zip, in about 0.2 s wall time; the other three parts took
under 5 ms. CPU (JSON and deflate, timed in Node on the same file): 65–160 ms.

**CPU limits for Cron Triggers** (Cloudflare docs, Workers limits, read 2026-11-03): Workers
Free **10 ms** per Cron Trigger; Workers Paid 30 s for intervals under an hour and **15 min**
for an hour or more (weekly). So the weekly dump needs Workers Paid: on Free it would stop at
10 ms and record nothing (the run is cut off before `last_maintenance` is written). The prunes
and draft cleanup alone are a few ms of CPU. If the account moves to Free, drop the dump from
the cron (keep the manual download) or move it to a Workflow.

**Costs:** Cron Triggers are free (5 per account on Free, 250 on Paid; we use 2). Each week:
~14k D1 rows read on the seed (scales with entries; under 0.3% of a Free day), one R2 write
(the dump) plus a few list and delete calls, and ~250 kB to 1 MB more R2 storage, 12 weeks
kept.

## Going live

The launch steps (roadmap M8 step 8), in order:

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

### Moving to a new host

An organization that takes over the site deploys it from its own Cloudflare account and GitHub
repository without editing code:

1. Create the D1 databases `frailty-prod` and `frailty-preview` and the R2 buckets
   `frailty-prod-files` and `frailty-preview-files` (the bucket names are still in
   `wrangler.jsonc`; other names need an edit there).
2. Set up Access and the GitHub environments as above. In each environment set the variables
   `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `SITE_URL` and `D1_DATABASE_ID` (that environment's
   database id), and the four secrets. `CF_BEACON_TOKEN` is optional ("Web Analytics" above).
3. Rate-limit `namespace_id`s (`1001`, `1002`, `2001`, `2002` in `wrangler.jsonc`) only need to be
   unique within the account; change them only if the account already uses them.
4. Push to `main` (preview deploys, migrations included), load the reference data with the
   Reference data workflow, then tag a release for production.
