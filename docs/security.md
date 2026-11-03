# Security

## What we protect

The data is public state policy, and there is no patient data. The risks are about
**integrity and trust**, not secrecy:

| Asset | Threat | Main control |
| --- | --- | --- |
| Published code lists | Wrong or malicious data published; a bad file wipes a state | Access-only writes, draft → checks → publish, versioning, rollback, backups |
| Admin functions | Someone other than an admin reaches them | Cloudflare Access + JWT check in the Worker |
| Pre-launch site | Seen or indexed before it is ready | Whole-site Access + `SITE_MODE=private` gate + `noindex` |
| Visitors | XSS from ingested text (descriptions come from external files and AI output) | Vue text binding only, no `v-html`, strict CSP |
| Hosting bill | Abuse that pushes us off the free tier, or a runaway Claude API bill | Edge caching, rate limits, Cloudflare WAF, Anthropic spend limit |
| Credibility | A "like" match read as an official match; out-of-date lists | Clear labels, source links and dates on every state, disclaimer |
| Supply chain | Malicious or vulnerable npm packages | Lockfile, pinned versions, Dependabot, CodeQL, small dependency list |

## Authentication: Cloudflare Access

- Identity provider: Google. Policy: allow an explicit list of email addresses (no
  domain-wide rules). Session length: 24 hours.
- **Before launch:** one Access application covers the whole `*.workers.dev` hostname, plus
  preview URLs.
- **After launch:** the Access application covers only `/admin*` and `/api/admin*`.
- **Defense in depth:** the Worker middleware `access-jwt` verifies the
  `Cf-Access-Jwt-Assertion` header on every admin route (and every route while
  `SITE_MODE=private`): signature against the team's JWKS (`/cdn-cgi/access/certs`), `aud` =
  the application AUD tag, `iss` = the team domain, expiry. The email must also be in the
  `ADMIN_EMAILS` secret (kept out of the public repo). Missing or invalid → 401 (403 for wrong email). This means a
  misconfigured Access policy alone cannot open the admin API.
- Local dev: a `DEV_ADMIN_EMAIL` bypass that only works when `ENVIRONMENT=development` and
  the request comes from localhost. A test asserts that the bypass is off in every other environment.
- **Implemented in M0 step 5** (`apps/api/src/auth/access.ts`, `middleware/site-gate.ts`,
  `middleware/require-admin.ts`):
  - The **site gate** (private mode) accepts **any identity Access let in**: admins, guest
    testers (M8) and service tokens (CI). Only admin routes check `ADMIN_EMAILS` (user, 2026-11-01).
  - **Admin routes** are `/admin`, `/admin/*` and `/api/admin/*`, checked in every `SITE_MODE`.
    Service tokens have no email, so they never pass the admin check. Admin responses are
    `no-store` and `noindex`.
  - **Fails closed:** `SITE_MODE` other than exactly `public` = private; empty
    or unset `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` (Worker secrets, uploaded by CI) = every
    gated request is 401 (and an error is logged).
    If the certs cannot be fetched, the request fails with a 500, never a pass.
  - Rejected tokens are logged as a warning with the `jose` error code only (no token, no email).
  - The dev identity counts as an admin, so `pnpm dev` exercises the gate and admin pages
    locally.

## Pre-launch gate

See `docs/architecture.md` ("Site gate") and `docs/deployment.md` ("Going live"). While
private: Access on everything, Worker JWT check on everything, `X-Robots-Tag: noindex, nofollow`
on every response, and `robots.txt` disallows all. `robots.txt` is the one path the Worker
serves without a token, because it reveals nothing. (Access still asks for a login at the edge
unless the Access application bypasses that path.)

## Write safety

- All writes are `POST`/`PUT`/`DELETE` under `/api/admin`. Public routes are `GET` only; any
  other method returns 405.
- CSRF: Access cookies are `SameSite=Lax`; the API also rejects writes whose `Origin` is not
  the site's own origin, and requires `Content-Type: application/json` (no form posts).
  Code: `apps/api/src/middleware/admin-write-guard.ts` (403 / 415 / 413). The one exception
  to JSON is `POST /api/admin/sources`, which takes the raw file as `application/octet-stream`
  up to 25 MB (still own-origin only).
- Every write is limited to one `state_id`/`version_id` (see `docs/data-model.md`) and
  recorded in `audit_log` with the admin's email.
- Inputs: zod-validate every body, query and path parameter. Reject unknown keys. Cap sizes
  (row chunk ≤ 500 rows, request body ≤ 5 MB, string fields ≤ 2,000 chars).
- SQL: Drizzle query builder or bound parameters only. No string-built SQL. FTS queries are
  escaped (quote each term) so users cannot inject FTS operators.

## Upload safety

- Files are parsed only in the admin's browser, inside a Web Worker.
- The Worker never parses an upload. It re-hashes the body (the browser's hash must match),
  checks the first bytes against the claimed type (`%PDF-`, zip header for xlsx, no NUL bytes
  for text), and stores it. The R2 key never leaves the Worker.
- `pdfjs-dist` is pinned to a current release (CVE-2024-4367 affected versions below 4.2.67).
  pdf.js 6 has no eval path left (the `isEvalSupported` option was removed with it; no
  `eval` or `new Function` in either build), and our CSP forbids eval anyway. It runs with
  font loading off, no fetches, and in its own worker started from our parser worker. Its
  optional native canvas module is never installed (`ignoredOptionalDependencies`).
- Excel files are read with `read-excel-file` (npm, pinned), never the stale npm `xlsx`
  package (unmaintained, known CVEs).
- The original file goes to R2 as `application/octet-stream` with
  `Content-Disposition: attachment`, under a random key. It is never served inline from our
  origin. Public source links point at the state's own URL.
- Size limits are in `docs/ingestion.md`.
- **Backups** (`/admin/restore`): the full download holds `audit_log`, so admin email
  addresses (Access identities). They stay in, because the file is admin-only (the route is
  under `/api/admin`); keep the file private. It holds no tokens, headers or secrets (a test
  checks), no source files and no R2 keys. The **weekly dump** (M7 step 2) is the one exception:
  it stays in R2 and keeps `source_documents.r2_key` so restore path 3 finds the files; its
  download (`GET /api/admin/backup/weekly/:date`, strict date, audited) is admin-only like the
  rest, and a key alone gives no access (R2 has no public URL here). An imported backup is read only in the browser:
  50 MB file limit, a zip must hold exactly one top-level `.json` entry, and inflating stops
  as soon as the JSON passes 50 MB (declared or actual size), so a zip bomb cannot fill the
  tab. Its entries go to a draft through the normal draft API; nothing writes published
  rows directly.
- CSV exports prefix cells that start with `= + - @` with `'` to stop formula injection.

## AI cleanup

- AI output is untrusted data. It goes through the same zod validation and human review as
  any file.
- `ANTHROPIC_API_KEY` is a Worker secret and is never sent to the browser. The AI endpoint is
  admin-only and rate-limited (30 calls per hour across all admins, counted in the audit log).
  Set a monthly spend limit in the Anthropic Console.
- The server builds the prompt from the part's text, so the key cannot be used as a general
  chat proxy. The source text sits between `<source_text>` tags, marked as data. The answer is
  validated with zod (`parseAiOutput`) in the browser and never rendered as HTML.

## HTTP headers (set by middleware on every response)

Set in `apps/api/src/middleware/security-headers.ts` with Hono's `secureHeaders` (M0 step 3).
Every request runs the Worker first until launch, so static files get them too.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:;
  object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
X-Frame-Options: DENY
```

`secureHeaders` also adds its other defaults (`X-XSS-Protection: 0`, `X-DNS-Prefetch-Control: off`,
`Origin-Agent-Cluster`, and similar), which are harmless.

- **No `'unsafe-inline'` for styles** (user, 2026-11-01). Vue applies `:style` bindings through
  the DOM (CSSOM), which CSP does not block, and Tailwind ships one external stylesheet. The
  placeholder page renders in headless Chrome with no CSP violations. The step 4 browser tests
  will catch any regression.
- Fonts are self-hosted, so `font-src 'self'` is enough (no Google Fonts).
- **No inline scripts.** The pre-paint theme script is an external file
  (`apps/web/public/theme-init.js`), so `script-src 'self'` covers it with no hash to maintain.
  Any future inline script needs a `'sha256-…'` hash instead.
- **Public API routes are read only:** `apps/api/src/middleware/public-get-only.ts` returns 405
  with `Allow: GET, HEAD` for any other method on `/api/public/*` (required test).
- If the AI button needs a direct browser call, it does not: the browser calls our API, which
  calls Anthropic.
- Workers Logs redact query strings (`observability.redact_query_string`), so search terms
  never reach logs.

## Abuse and cost controls

- Public responses cached at the edge (see `docs/architecture.md`, "Caching").
- Workers Rate Limiting bindings on the public API (`apps/api/src/middleware/rate-limit.ts`),
  keyed on the client IP (`CF-Connecting-IP`): `PUBLIC_RATE_LIMITER`, 120 requests per 60 s, on
  `/api/public/*`, and the stricter `SEARCH_RATE_LIMITER`, 60 per 60 s (search-as-you-type is debounced, and an office may share one IP), on
  `/api/public/codes/search` instead. Over the limit: `429 {"error":"Too many requests"}` with
  `Retry-After: 60`. The IP is never logged. Limits are counted per Cloudflare location and are
  approximate ([docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/));
  the binding has no charge of its own on Workers Paid and works on workers.dev. A request
  without `CF-Connecting-IP` (only possible locally) shares one fallback key. Local Workers
  (`ENVIRONMENT` `development` or `test`: `pnpm dev`, e2e, Vitest) skip the limits; any other
  value applies them.
- **Not limited:** admin routes (`/admin*`, `/api/admin/*`: Cloudflare Access and the JWT check
  stand in front of them) and the server-rendered HTML pages, `robots.txt` and static files
  (edge caching absorbs repeat requests, and the pages read little from D1). Many people behind
  one office or mobile IP share a limit, so raise the numbers in `wrangler.jsonc` if real users
  report 429s.
- Cloudflare free WAF managed rules and Bot Fight Mode on once a custom domain exists.
- A billing notification in the Cloudflare dashboard.

## Repo and supply chain

- Public repo: secrets only in `wrangler secret` / GitHub encrypted secrets / `.dev.vars`
  (gitignored). Two layers of secret detection: GitHub secret scanning with **push protection**
  (on), and `gitleaks` over the full history in CI. gitleaks-action is free for a personal
  account; if the repo moves to an organization, add a free `GITLEAKS_LICENSE` secret.
- Dependabot alerts and security updates (on), weekly version updates for npm and GitHub
  Actions (`.github/dependabot.yml`, with a 3-day `cooldown` matching pnpm's
  `minimumReleaseAge`). **Security updates ignore the cooldown**: if one is younger than 3
  days, CI's install fails; wait, don't add an exception. CodeQL default setup (JavaScript/
  TypeScript and Actions, managed by GitHub). `pnpm audit --prod --audit-level high` in CI.
- GitHub Actions pinned to commit SHAs (with the version in a comment); workflow
  `permissions: contents: read`; checkout without persisted credentials. Deploys (step 7)
  run in GitHub environments with their own Cloudflare API token each; tokens can only be
  limited to the project's dedicated Cloudflare account (`docs/deployment.md`). Production
  deploys need the project lead's approval and a tag on a `main` commit; `pnpm cf` refuses a
  production deploy from a laptop.
- **Ruleset on `main`** (no bypass, not even for admins; user, 2026-11-01): pull request
  required (0 approvals, since the owner cannot approve their own PR), status checks `check`,
  `audit` and `gitleaks` must pass on an up-to-date branch, CodeQL results must have no high or
  critical alerts, no force-push, no deletion. In an emergency, an admin can edit the ruleset.
- Private vulnerability reporting is on; `SECURITY.md` points to it.
- pnpm `allowBuilds` (pnpm 12's name for the old `onlyBuiltDependencies`): install scripts run
  only for packages listed as `true`. Today every listed package is `false`.

## Content safety

- Every state page shows its source document links, publish date and the date we loaded it.
- Site-wide disclaimer: not legal or medical advice, not an official source, check with the
  state. "Like" matches always carry a label that explains them.
- AMA CPT notice in the footer (see `docs/data-model.md`, "Licensing of code text").

## Before launch

Run the `security-review` skill on the full codebase, review Access policies, test that
`SITE_MODE=public` still blocks `/admin` and `/api/admin` without a JWT (Playwright test against
the deployed preview), and check headers with securityheaders.com.
