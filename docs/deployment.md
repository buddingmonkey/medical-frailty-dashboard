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
| URL | `frailty-dashboard.<account>.workers.dev` (custom domain later) | `frailty-dashboard-preview.<account>.workers.dev` |

Workers preview URLs (per-version URLs) stay **off**, or behind Access, so no unprotected copy of
the site exists.

Workers Logs and Traces are on (`observability` in `wrangler.jsonc`; free plan: 200,000 log
events a day, kept 3 days). Query strings are redacted. Errors are logged as one JSON line.

Worker variables: `ENVIRONMENT`, `SITE_MODE` (`private` on both Workers until launch),
`ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (empty in `wrangler.jsonc` until step 7 creates the Access
application; while empty, every gated request is a 401), `AI_MODEL`. `DEV_ADMIN_EMAIL` exists
only locally (`pnpm dev` sets it to `dev@localhost`). The deployed smoke test (step 7) needs an
**Access service token**; it passes the site gate but, having no email, never the admin check.
Secrets: `ADMIN_EMAILS` (comma-separated; a secret so the emails stay out of the public repo),
`ANTHROPIC_API_KEY` (optional). Local values go in `apps/api/.dev.vars`
(gitignored; `.dev.vars.example` is committed).

## Cost

| Item | Free tier | When we'd pay |
| --- | --- | --- |
| Workers | 100k requests/day, 10 ms CPU per request. Static asset requests are free and unlimited | > 100k API requests/day, or CPU-heavy requests (big chunk uploads). **Workers Paid: $5/month** (10M requests, 30 s CPU per request), and it raises the D1 limits too |
| D1 | 5 GB, 5M rows read/day, 100k rows written/day, 7-day Time Travel | Paid plan: 30-day Time Travel and much larger quotas |
| R2 | 10 GB storage, 1M writes, 10M reads/month, no egress fees | Unlikely: source PDFs + backups are well under 1 GB |
| Cloudflare Access | Free for up to 50 users | Never, for a few admins |
| GitHub (public repo) | Unlimited Actions minutes, CodeQL, Dependabot | Never |
| Domain (optional) | — | ~$10/year at Cloudflare Registrar (at cost) |
| Claude API (optional) | — | Pay per token, only when the admin clicks the AI cleanup button. Set a spend limit |

**Expected: $0/month** (plus ~$10/year if you buy a domain). Size estimate: 50 states ×
~5,000 entries ≈ 250k rows ≈ well under 500 MB in D1. A full re-ingest of one large state
(≈ 6,000 rows plus FTS and index writes) fits inside the daily write quota. Load a few states
per day if bulk-seeding many.

Watch for: a publish that writes > 100k rows in one day (free tier), and search traffic that
misses the cache. Turn on a Cloudflare usage notification. If either becomes a problem, switch
to Workers Paid ($5/month) rather than re-architecting.

## Environments and CI/CD

| Trigger | What happens |
| --- | --- |
| PR | `pnpm check:full`, CodeQL, gitleaks, audit. No deploy |
| Merge to `main` | Checks, `wrangler d1 migrations apply frailty-preview --remote`, deploy preview, smoke test |
| Release tag `v*` (manual) | Checks, backup prod D1 to R2, `wrangler d1 migrations apply frailty-prod --remote`, deploy production, smoke test |

- The deploy job uses a Cloudflare API token limited to these Workers, D1 databases and R2
  buckets, stored as a GitHub environment secret with required reviewers (you) on the
  `production` environment.
- Migrations must be backward-compatible with the previous Worker version (add columns and
  tables first, drop them in a later release), because migrations run before the new code is live.
- Rollback a bad deploy: `wrangler rollback` to the previous Worker version (data is not
  touched). Rollback bad data: see "Backups and restore".

## Backups and restore

| Backup | How | Kept |
| --- | --- | --- |
| Before every publish | The Worker writes the state's current published version as JSON to R2 | 20 per state |
| Weekly full dump | Worker Cron Trigger (Sunday) → JSON of every table to R2 `backups/weekly/` | 12 weeks |
| Before each production deploy | CI runs `wrangler d1 export` and uploads to R2 | 10 |
| Manual download | Admin page "Download backup" → `GET /api/admin/backup` streams JSON to the admin's computer | Your computer |
| Point in time | D1 Time Travel (`wrangler d1 time-travel restore`) | 7 days free / 30 days paid |

Restore paths, from smallest to largest:

1. **One state wrong:** admin → state → versions → roll back (no backup needed).
2. **A state's history lost:** admin → import backup JSON for that state → goes through the
   normal draft → checks → publish flow.
3. **Whole database bad:** `wrangler d1 time-travel restore frailty-prod --timestamp=<before>`,
   or create a new D1 from a `wrangler d1 export` SQL file and point the binding at it.

Test restore path 2 in E2E, and do a path 3 drill on the preview database once before launch.

## Going live

Before launch (M7), with everything below checked off in `docs/status.md`:

1. Launch gate met (`docs/roadmap.md`, M7): at least 2 states with every category mapping
   confirmed, the usability gate passed, and the disclaimer and CPT notice reviewed.
2. `security-review` run and findings closed; Playwright smoke passes against preview with
   `SITE_MODE=public`.
3. Change the production Access application from the whole host to `/admin*` and
   `/api/admin*` only.
4. Set `SITE_MODE=public` on production and deploy (this removes `noindex` and the disallow-all
   `robots.txt`).
5. Run the production smoke spec: public pages return 200; `/admin` and `/api/admin/*` return
   401/redirect without login.
6. Serve hashed static files without the Worker: in `apps/api/wrangler.jsonc` change
   `run_worker_first` from `true` to `["/*", "!/assets/*"]`, and add `apps/web/public/_headers`
   with `/assets/*` rules for `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`
   and `Cross-Origin-Resource-Policy: same-origin` (CSP matters only on HTML, which still goes
   through the Worker). This cuts Worker requests to about 1 per page view.
7. Optional: buy the domain, add it as a Worker custom domain, add WAF/Bot Fight Mode, and
   move the Access application to the new host name.

To take the site private again, do steps 4 then 3 in reverse.
