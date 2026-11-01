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

## Pre-launch gate

See `docs/architecture.md` ("Site gate") and `docs/deployment.md` ("Going live"). While
private: Access on everything, Worker JWT check on everything, `X-Robots-Tag: noindex`, and
`robots.txt` disallows all.

## Write safety

- All writes are `POST`/`PUT`/`DELETE` under `/api/admin`. Public routes are `GET` only; any
  other method returns 405.
- CSRF: Access cookies are `SameSite=Lax`; the API also rejects writes whose `Origin` is not
  the site's own origin, and requires `Content-Type: application/json` (no form posts).
- Every write is limited to one `state_id`/`version_id` (see `docs/data-model.md`) and
  recorded in `audit_log` with the admin's email.
- Inputs: zod-validate every body, query and path parameter. Reject unknown keys. Cap sizes
  (row chunk ≤ 500 rows, request body ≤ 5 MB, string fields ≤ 2,000 chars).
- SQL: Drizzle query builder or bound parameters only. No string-built SQL. FTS queries are
  escaped (quote each term) so users cannot inject FTS operators.

## Upload safety

- Files are parsed only in the admin's browser, inside a Web Worker.
- `pdfjs-dist` is pinned to a current release (CVE-2024-4367 affected versions below 4.2.67)
  with `isEvalSupported: false`.
- SheetJS comes from the official CDN tarball, not the stale npm `xlsx` package.
- The original file goes to R2 as `application/octet-stream` with
  `Content-Disposition: attachment`, under a random key. It is never served inline from our
  origin. Public source links point at the state's own URL.
- Size limits are in `docs/ingestion.md`.
- CSV exports prefix cells that start with `= + - @` with `'` to stop formula injection.

## AI cleanup

- AI output is untrusted data. It goes through the same zod validation and human review as
  any file.
- `ANTHROPIC_API_KEY` is a Worker secret and is never sent to the browser. The AI endpoint is
  admin-only and rate-limited (e.g. 30 requests per hour). Set a monthly spend limit in the
  Anthropic Console.

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
- A Workers Rate Limiting binding on public API routes (e.g. 120 requests/min per IP) and on
  search.
- Cloudflare free WAF managed rules and Bot Fight Mode on once a custom domain exists.
- A billing notification in the Cloudflare dashboard.

## Repo and supply chain

- Public repo: secrets only in `wrangler secret` / GitHub encrypted secrets / `.dev.vars`
  (gitignored). `gitleaks` runs in CI.
- Dependabot (npm + GitHub Actions), CodeQL (free for public repos), `pnpm audit` in CI.
- GitHub Actions pinned to commit SHAs; workflow `permissions:` least privilege; the deploy
  job uses a Cloudflare API token scoped to this Worker, D1 database and R2 bucket only.
- Branch protection on `main`: PR required, `pnpm check:full` must pass.
- pnpm `onlyBuiltDependencies` allowlist so install scripts don't run for arbitrary packages.

## Content safety

- Every state page shows its source document links, publish date and the date we loaded it.
- Site-wide disclaimer: not legal or medical advice, not an official source, check with the
  state. "Like" matches always carry a label that explains them.
- AMA CPT notice in the footer (see `docs/data-model.md`, "Licensing of code text").

## Before launch

Run the `security-review` skill on the full codebase, review Access policies, test that
`SITE_MODE=public` still blocks `/admin` and `/api/admin` without a JWT (Playwright test against
the deployed preview), and check headers with securityheaders.com.
