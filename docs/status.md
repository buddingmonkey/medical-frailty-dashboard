# Status

_Last updated: 2026-11-01_

## Where things stand

- **Phase:** M0 scaffolding. **Step 1 done** (branch `m0-step1-workspace`): pnpm workspace
  with `apps/web`, `apps/api`, `packages/shared` (one placeholder `src/index.ts` each), strict
  TypeScript base config, type-aware ESLint flat config, Prettier, `.editorconfig`, `.nvmrc`
  (26). `pnpm lint`, `pnpm typecheck` and `pnpm format:check` pass. `pnpm check` arrives in
  step 4.
- **Step 2 done** (branch `m0-step2-web`): `apps/web` is a Vite 8 + Vue 3.5 + Vue Router 5
  (file-based routes) + Tailwind 4.3 + TanStack Query 5 app with a placeholder home page and a
  404 page. Design tokens (light and dark) are in `apps/web/src/styles/main.css`; see
  `docs/architecture.md`, "Design tokens".
- **Step 3 done** (branch `m0-step3-api`): `apps/api` is a Hono Worker that serves
  `apps/web/dist` (SPA fallback), `GET /api/public/health`, JSON 404 for unknown `/api/*`, and
  the security headers on every response (strict CSP, no `'unsafe-inline'`). `pnpm dev` runs
  it on http://localhost:8787; `pnpm build` adds a `wrangler deploy --dry-run`. Workers Logs and
  Traces are on. Nothing is deployed yet (step 7).
- **Step 4 done** (branch `m0-step4-tests`): test harness. `pnpm check` (format, lint, types,
  unit, component, api; one line each, logs in `.logs/latest/`) and `pnpm check:full` (+ build,
  e2e with axe in light and dark). 16 Vitest tests + 5 Playwright tests. Public API routes now
  return 405 for non-GET. The header has a System/Light/Dark theme menu (icons, dropdown).
- **Step 5 done** (branch `m0-step5-auth`): Access JWT verification (`jose`), the site gate
  (private by default, fails closed), admin checks on `/admin*` and `/api/admin*`,
  `GET /api/admin/whoami`, a two-mode `robots.txt`, and the localhost-only dev bypass. 39 API
  tests, including every required auth test in `docs/testing.md` that applies so far.
- **Step 6 done** (PR #6): GitHub Actions CI (`check`, `audit`, `gitleaks`; about 1.5 min),
  Dependabot (3-day cooldown), CodeQL default setup (JS/TS + Actions), private vulnerability
  reporting, data-error issue template, `SECURITY.md`, `CONTRIBUTING.md`, README setup steps.
  `main` is protected by a ruleset with **no bypass**: every change goes through a PR with
  green checks; a direct push is refused (tested).
- **Next step:** M0 step 7 (Cloudflare: Workers, D1, R2, Access; deploy from CI). Needs the
  project lead's Cloudflare account, an API token for CI, and the admin emails for the
  `ADMIN_EMAILS` secret.
- **Toolchain:** Node 26 LTS, pnpm 12.16.1 (installed by hand), TypeScript 6.0.3 (not 7; see
  `docs/architecture.md`, "Tool versions"). pnpm refuses packages younger than 3 days.
- **Skill folders** (`.agents/`, `.claude/skills/`, `skills-lock.json`) stay untracked on
  purpose (user, 2026-11-01). Their sources are in `docs/architecture.md`, "Agent skills".

## Decisions made (2026-11-01, with the user)

| Topic | Decision |
| --- | --- |
| Hosting | Cloudflare: one Worker serves the Vue build (static assets) and the API; D1 for data; R2 for source files and backups |
| Parsing | In the admin's browser (pdf.js, SheetJS). The server receives validated JSON rows only |
| AI cleanup | Both: a copy-paste prompt (free, always available) and an optional Claude API button that appears only when an API key secret is set |
| Admin auth | Cloudflare Access with Google login, plus JWT verification in the Worker |
| Pre-launch | The **whole site** is behind Access until the user marks it live. After launch, only `/admin*` and `/api/admin*` stay protected |
| CPT text | Show the state's published description with a citation, and an AMA notice in the footer. No CPT descriptor table of our own |
| Repo | Public on GitHub (free Actions minutes, CodeQL) |
| Domain | None yet. Use `*.workers.dev` until a domain is bought (~$10/yr via Cloudflare Registrar) |
| Seed states | Georgia (Attachments A and B), Louisiana, Montana, Nebraska |
| Name | **Medical Frailty Coding Dashboard** |
| Licence | MIT (already in `LICENSE`) |
| Admins | Two Google accounts (the user and one other). The emails live only in the Access policy and the `ADMIN_EMAILS` Worker secret, **never in the public repo** |
| Georgia A/B | Two tiers, loaded as one version; tier kept in `entries.tier` |
| Tiers and qualification | Show **each state's own rule**: the state's tier label plus a badge (qualifies alone / needs another code / supporting evidence / state doesn't say), with "inferred" shown where we deduced it. Site-wide note on the 2026-10-29 *Massachusetts v. Oz* ruling. Compare and search can filter to "qualifies alone" (user, 2026-11-01, after research showed the ruling does not strike down tiers). **Provisional:** the user works with a team of lawyers who may ask to remove or reword the badges later |
| Look and feel | Colours based on the Georgetown CCF palette; open-licensed fonts (Jost headings, Source Sans 3 body, IBM Plex Mono codes), self-hosted; no serif for now. **Not an official CCF site**: no CCF name or logo; branding may be added later (user, 2026-11-01) |
| Dark mode | Light, dark and "follow system" must all work before launch. Tokens for both themes exist; the switch comes in M0 step 4; axe runs in both themes in M7 (user, 2026-11-01) |
| Static files and the Worker | Until launch every request runs the Worker first (one place for headers; site gate covers assets). At go-live, `/assets/*` moves to direct serving with a `_headers` file (user, 2026-11-01) |
| CSP styles | No `'unsafe-inline'` for `style-src` (user, 2026-11-01) |
| Logs | Workers Logs + Traces on, query strings redacted; free tier (user, 2026-11-01) |
| Theme menu | Dropdown with icons in the header (System / Light / Dark) (user, 2026-11-01) |
| Site gate | Before launch, anyone Access lets in may see the site (admins, guest testers, CI service token); admin routes also need `ADMIN_EMAILS` (user, 2026-11-01) |
| robots.txt | Private: disallow all. Public: allow the site, disallow `/admin` and `/api/`; add a sitemap at launch (user asked for a good one from the start, 2026-11-01) |
| SEO and GEO | Best practices; AI crawlers welcome so AI gets the right information. Worker renders real HTML for public pages. `Content-Signal: search=yes, ai-input=yes, ai-train=yes`. See `docs/seo.md` (user, 2026-11-01). **`ai-train=yes` is provisional:** the legal team may revisit it because pages quote AMA-copyrighted CPT text |
| Domain and hosting | The project lead buys a domain in M7, or gives the site to an organization to host. Keep the site portable (user, 2026-11-01) |
| Branch protection | Ruleset on `main` with no bypass, not even for admins (user, 2026-11-01) |
| Launch criteria | At least **2 states** with every category mapping confirmed by an admin, plus a usability gate: real target users can complete the core tasks (roadmap M7) |

## Open questions

1. **Dates to watch** are in "Watch dates" below (next: ~2026-12-28, the *Massachusetts v. Oz*
   appeal deadline).
2. **Louisiana "Code Designation" (0/1/2):** likely 0 = qualifies alone, 1 = needs a
   supporting code, 2 = supporting evidence only (SHVS 2026-09-11 + a fit against the data).
   Not confirmed by LDH, so it is shown as "inferred". The "code system" explanation does not
   fit the data. See `docs/sources.md`.
3. **Louisiana .xlsx:** none public (search, 2026-11-01). LDH's work requirements page
   (https://ldh.la.gov/Medicaid/work-requirements) links only PDFs, and none of them is the
   code list; the source URL of our `HR1-Codes` PDF is unknown. Next step if wanted: ask LDH
   or an MCO provider-relations line for the .xlsx and the Code Designation definition.
   Until then, parse the PDF.
4. **Georgia source:** URL and publish date of Attachments A and B.

## Watch dates

Dates we must act on. Until the `/admin/watch` page exists (roadmap M2 step 2), track them
here; that page is seeded from this table. Approximate dates are marked ~.

| Date | What | Why it matters | Source |
| --- | --- | --- | --- |
| ~2026-12-28 | *Massachusetts v. Oz*: CMS appeal deadline (60 days from judgment; exact date depends on when judgment was entered) | An appeal or stay may change the site's ruling note; states may loosen combination rules either way | `docs/sources.md`, "Federal and court rulings" |
| 2027-01-01 | Work requirements take effect | States may publish final or revised lists before this date; re-check all seed states | H.R.1 §71119 |
| ~2027-04-29 | End of the 6-month enforcement stay for the 26 plaintiff states (6 months from 2026-10-29; confirm against the order) | Plaintiff states' frailty processes may change | Opinion, "Relief" |
| No date | *Taylor v. Kennedy* (D. Md. 1:26-cv-03705) pending | A ruling could change the federal rules again | `docs/sources.md` |
| No date | LDH confirms Louisiana "Code Designation" meaning | Remove the "inferred" label, or fix the mapping | `docs/sources.md`, Louisiana |
| No date | Legal team reviews qualification badges, ruling note, disclaimer, CPT text, and `ai-train=yes` in `robots.txt` | Badges may be removed or reworded; AI training signal may change | This file, decisions table; `docs/seo.md` |

## Re-ingestion safety (user requirement, 2026-11-01)

States will reissue their lists. A re-upload must be able to replace a whole state, with
warnings and data checks so a wrong file cannot damage the database. Design: draft versions,
blocking/typed-confirm checks, diff, atomic per-state publish, pre-publish backup, one-click
rollback. See `docs/ingestion.md` ("Checks before publishing") and `docs/data-model.md`
("Replacing a state's list").

## How the user likes to work

- The user works with a team of lawyers. On legal questions (what the ruling means, how
  qualification is described, disclaimers, CPT text) the lawyers decide. Present research and
  a recommendation, label it as not legal advice, and expect changes.

- Keep `CLAUDE.md` small. It points to docs that agents load when they need them.
- The user pays for hosting personally, so keep running costs near $0. Say what anything
  will cost before adding it.
- Ask questions instead of guessing on product decisions.
