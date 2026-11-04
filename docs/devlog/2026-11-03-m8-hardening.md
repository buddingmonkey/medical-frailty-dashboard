# 2026-11-03: M8 hardening (steps 1–4, 6, 7)

**Milestone:** M8 steps 1, 2, 3, 4, 6, 7  •  **People:** project lead  •  **AI:** Claude Code,
Opus 5.5 main session (the lead) + 8 Opus builders in worktrees + 1 security review agent

## Goal
Do every M8 step that does not need real users or a domain: the launch data gate, the
accessibility, performance and SEO passes, the About page and site basics, analytics wiring,
rate limits and portability. Stop before step 5 (usability gate) and step 8 (go live).

## What happened
1. 15:16 CST: the project lead said "start M8". Wave 1 ran three builders in parallel:
   step 1 (launch readiness), step 4a (About and policy pages) and step 7a (rate limits,
   D1 ids from GitHub variables).
2. **Step 1** (#85): `/admin/launch-readiness`. The builder found that "every mapping
   approved" and the public "Reviewed" label can disagree (a category approved to a draft
   unified category still shows "Not yet reviewed"), so the gate also counts what the public
   page shows. 0/0/0 = ready; 2 ready states pass the data gate.
3. **Step 7a** (#86): Workers Rate Limiting bindings on `/api/public/*` (120/min per IP;
   search 60/min, raised from the builder's 30 because search runs as you type). D1 ids
   moved out of `wrangler.jsonc`: CI writes `vars.D1_DATABASE_ID`. With the project lead's
   OK, the main session set the two GitHub variables; the next preview deploy used them.
4. **Step 4a** (#87): `/about` with 13 anchored sections, `/disclaimer`, `/privacy`,
   `/accessibility`, footer links, "Report a problem" (GitHub issue form), "Data last
   updated", and "learn more" links at the places M6 left waiting. About joined the main nav.
5. The project lead asked to address the Dependabot alerts. All three were dev-only
   (minimatch, glob, esbuild). Dependabot's own PRs failed because it does not update pnpm
   subdependencies; narrow `overrides` in `pnpm-workspace.yaml` closed them (#89). 0 open.
6. The project lead found Georgia's source: the DCH public notices page. The posted
   Attachments A and B are **byte-identical** to the loaded files (SHA-256), posted
   2026-07-09 with the state plan amendment notice (#88). Production had no way to edit a
   source's URL or date, so a builder added `PUT /api/admin/sources/:id` and an inline form
   (#90).
7. **Step 4b** (#91): our own mark (navy square, white list lines, gold bullets), favicon,
   touch and manifest icons, share image, `site.webmanifest`, OG/Twitter tags,
   `security.txt` (Expires computed per request), print styles, a title and description on
   every page. CodeQL flagged an unescaped RegExp in a test; fixed by a prefix compare.
8. The project lead asked that every script run on Windows, macOS and Linux (#92). The bash
   `builder-setup` became Node; a spawn helper runs pnpm without a shell on every OS;
   `dev:stop` uses PowerShell and `taskkill` on Windows; getting-started leads with native
   PowerShell. A new `check (windows)` CI job found three real bugs over four runs.
9. The project lead asked whether Web Analytics needs a domain. Cloudflare's docs say no
   (manual setup by hostname), but the token is tied to the hostname. **Steps 3 and 6** (#93)
   in one builder: Lighthouse mobile performance 69–76 → 96–97 (CLS 0.5 → 0), a bundle
   budget stage, `/llms.txt`, JSON-LD on every indexed page type, and the beacon behind
   `CF_BEACON_TOKEN` (empty = off). gitleaks flagged the fake test token twice.
10. **Step 7** security review over `v0.8.0...main`: no findings at confidence ≥ 8.
11. **Step 2** (#94): axe on 100 page/theme/state combinations (no violations), focus moves to
    the new page's `h1` after navigation, the skip link focuses `<main>`, Worker HTML got
    landmarks, search announces "Searching…", 320 px reflow fixed on Single codes.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Start M8 | Handoff hard stop lifted | Project lead |
| "Ready" = 0 unmapped, 0 unconfirmed, 0 "Not yet reviewed" on the public page | The roadmap's "auto" wording predates M5's unified layer | Lead (main session); builder added the public count |
| Search limit 60/min per IP | Search-as-you-type, offices behind one IP | Lead (main session) |
| Main session sets `D1_DATABASE_ID` in GitHub | Deploys fail without it; ids are already public | Project lead |
| Close Dependabot alerts with pnpm overrides | Dependabot cannot update pnpm subdependencies | Lead (main session) after the project lead asked |
| Source details editable after upload | Production GA sources had no URL or date | Lead (main session) |
| Scripts cross-platform; Windows CI job | Contributors should not need WSL | Project lead |
| Analytics configurable, off until a token is set | No domain needed, but the token follows the hostname | Lead (main session), after the project lead's question |
| Map "no list" outline colour left as is | Token changes are the project lead's call | Builder reported; waiting for the project lead |

## Corrections and surprises
- The builder's first rate limit (30/min for search) would have throttled one fast typist.
- `URL.pathname` as a file path became `D:\D:\…` on Windows; a test compared paths with `/`;
  Windows runners are ~3× slower, so the API test and hook timeouts went to 20 s and 30 s.
- The main session chained `pnpm check | tail && git commit`, so a failing check still
  committed and pushed once. The pipe's exit code is `tail`'s. Later commits saved the
  check's exit code first.
- gitleaks scans every commit in the PR: fixing the fake token in a later commit was not
  enough; the first commit needed a `.gitleaksignore` fingerprint.
- Georgia's files were already the official ones; only the URL and date were missing.

## What a non-technical builder should take from this
1. Ask "does this work on Windows?" early, and add a Windows CI job: it found bugs nobody
   could see on Linux.
2. When a scanner (CodeQL, gitleaks, Dependabot) complains, read what it found. Two of the
   five findings today were in tests, and all were quick fixes.
3. A "launch gate" page turns a vague goal ("mappings confirmed") into a number you can check.

## Numbers
- Time: 15:16–19:20 CST (≈ 4 h), including the Dependabot, Georgia and cross-platform asks.
- 10 PRs (#85–#94). Tests: 1,683 Vitest (unit 708, refdata 30, component 323, API 522,
  scripts 100) + 271 e2e (from 1,452 + 69 at v0.8.0).
- Lighthouse mobile (local): `/` 97, `/states/mt` 97, `/codes/icd-10-cm/F20.0` 96
  performance; accessibility and SEO 100. First load 112 KiB brotli.
- AI cost: not measured. Hosting: no change (Workers Paid; rate limiting has no extra charge).

## Open threads
- **Step 5 (usability gate)** and **step 8 (go live)** need the project lead.
- Restore drill on preview (step 7): needs the project lead's signed-in browser.
- Set GA's two source documents' URL and date on production after the next release.
- Register Web Analytics hosts and set `CF_BEACON_TOKEN` when ready.
- Decide: `check (windows)` as a required check; the map "no list" outline colour.
- Rich Results Test and the Cloudflare bot settings checklist (`docs/seo.md`).
- NVDA / VoiceOver manual checklist (`docs/testing.md`).
