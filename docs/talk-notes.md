# Talk and blog notes

Working notes for a future blog post or conference talk: **how a non-technical organization
can build a useful public tool with an AI coding assistant, safely and for almost no money.**
Add to this file whenever a devlog entry has something worth telling.

## Working title options

- "From PDFs to policy comparison: building a public Medicaid tool with an AI pair"
- "No developers, no budget: what it actually takes to build a civic data site with AI"

## Audience

Non-profit and advocacy staff, state agency staff, small policy shops. Some technical
literacy, little or no coding.

## Story arc (draft)

1. **The problem.** H.R.1 work requirements; states publish medically frail code lists in
   incompatible formats (PDF printouts of spreadsheets, 295-page indexes). Nobody can
   compare them.
2. **The bet.** Could a non-developer build the comparison tool with an AI assistant, keep it
   secure, and run it for about $0?
3. **Planning before code.** The AI read real files first, asked questions, and wrote the
   plan into docs that future sessions read.
4. **Where humans and AI were each wrong** (the strongest section). See "Moments" below.
5. **Guardrails that let a non-developer stay safe:** private until launch, checks before
   publishing data, rollback, tests, CI-only production deploys.
6. **Real users decide when it's ready.** The usability gate.
7. **Numbers.** Time, money, size.
8. **The playbook.** How the audience can do this (`docs/playbook.md`).

## Moments (with devlog links)

| Date | Moment | Lesson | Devlog |
| --- | --- | --- | --- |
| 2026-11-01 | Profiling the real PDFs found code formats the spec never mentioned | Give the AI real data early | `devlog/2026-11-01-planning.md` |
| 2026-11-01 | A pasted explanation of Louisiana's "Code Designation" contradicted the data; the AI caught it | Verify claims against data, whoever made them | same |
| 2026-11-01 | The project lead's reading of a court ruling was only partly right; a research agent found the opinion, and the main session double-checked the agent | Ask for primary sources; check the checker | same |
| 2026-11-01 | Mid-stream requirements (stay private until launch; safe full-state replacement) folded into the design | You can steer while it works | same |
| 2026-11-01 | Lawyers keep the final word on legal wording; the design makes badges switchable without code changes | Build for decisions you know will change | same |
| 2026-11-01 | The 3-day package-age guard refused two brand-new releases on its first install, and strict lint flagged the AI's own deprecated config | Safety rules catch real things on day one; check versions online, not from memory | `devlog/2026-11-01-m0-step1-workspace.md` |
| 2026-11-01 | The project lead asked for a palette "based on" a real organization's site. The AI pulled the colours from that site's stylesheet, but found its fonts are licensed to that organization only and picked free look-alikes | "Use their branding" has a legal edge: colours are fine as inspiration, licensed fonts and logos are not | `devlog/2026-11-01-m0-step2-web.md` |
| 2026-11-01 | Two docs disagreed: "static files skip the Worker" and "the Worker adds security headers to every response" cannot both be true. Found while planning, before any code | Ask the AI to list what in the plan looks wrong before it builds; contradictions are cheap to fix on paper | `devlog/2026-11-01-m0-step3-api.md` |
| 2026-11-01 | The AI recommended lowering the runtime date to match a test tool, and the project lead agreed. During install the tool turned out to be deprecated; its renamed successor matched production exactly, so the approved change was undone | Approvals rest on facts; when a fact changes, say so and revisit, even after a yes | `devlog/2026-11-01-m0-step4-tests.md` |
| 2026-11-01 | All 37 auth tests passed, but a manual check of the running site showed static pages were missing their `noindex` header. Two new tests reproduced it before the fix | Green tests cover only what they test; poke the real thing too | `devlog/2026-11-01-m0-step5-auth.md` |
| 2026-11-01 | "We want AI to crawl the site to get the right info" became an architecture requirement: most AI crawlers do not run JavaScript, so the single-page app must also send real HTML. Caught before any public page was built | Say what you want the site to achieve, not just what it should show; goals can change how it is built | `devlog/2026-11-01-m0-step5-auth.md` |
| 2026-11-01 | The project lead offered an existing Cloudflare account. The AI looked first: it served another project, and the site may be given away later. A new account, plus a per-repo token so the other project's login stayed untouched | Check what an "already set up" account is tied to before reusing it | `devlog/2026-11-01-m0-step7-cloudflare.md` |
| 2026-11-01 | "Never deploy production by hand" moved from a rule in a doc into a script that refuses to do it | Turn important rules into code where it is cheap | same |
| 2026-11-01 | The builder agent's first run, a cheap "recite your rules" check, repeated a stale line from `CLAUDE.md` ("production deploys from `main`"). The rules file was right; the top-level doc had drifted | A dry run of a new agent tests the docs it reads as much as the agent | `devlog/2026-11-01-m0-step8-builder.md` |
| 2026-11-01 | After the ruleset went on, the AI tried to push straight to `main` on purpose. GitHub refused it. The devlog for that step had to go through a pull request like everything else | A rule you have not tried to break is a rule you only hope works | `devlog/2026-11-01-m0-step6-github.md` |
| 2026-11-01 | The plan said "export the database to R2 before each production deploy". Cloudflare's docs say export refuses any database with a full-text search table, which the site needs. Caught while planning; the backup became a point-in-time restore bookmark | Check each step against the platform's real limits before building; a backup you can't take is worse than none | `devlog/2026-11-01-m1-step1-schema.md` |
| 2026-11-01 | The AI's first test of its own safety check "passed", but the edit meant to break things had matched nothing. It noticed and redid the test | Before trusting a passing safety check, confirm you actually broke something | same |
| 2026-11-01 | Counting every code in the real files by shape found six patterns the docs had missed. One, Louisiana's drug class codes, looks exactly like an ICD-10 diagnosis category and would have been filed under the wrong code system | Have the AI measure the real data before it writes rules | `devlog/2026-11-01-m1-step2-codes.md` |
| 2026-11-01 | Ten steps in, the project lead switched from approving every step to "stop only at the end of a milestone" | Trust grows with a track record; move the checkpoint, keep a hard stop | same |
| 2026-11-01 | All 124 unit tests passed, then GitHub's code scanner failed the PR: three text patterns could freeze the server on a crafted upload or URL. Tests reproduced the slowdown before the fix | Automated security checks find what your own tests never thought to try | `devlog/2026-11-01-m1-step2-codes.md` |
| 2026-11-01 | The national code list is 107,173 rows; the free database plan writes 100,000 a day. Counting first turned a deploy-day surprise into a design choice: one write per row, and a loader that picks up where it stopped | Ask how big the data is and what the free plan allows before you load it | `devlog/2026-11-01-m1-step3-reference-data.md` |
| 2026-11-01 | This year CMS added the first diagnosis codes with a letter in the second place (`QA0`). The parser refused line 30,620 instead of skipping it, which exposed the same wrong assumption in the code that reads state lists | Make programs stop on the unexpected; silent skipping hides news | same |
| 2026-11-01 | The planning docs said the keyword `disab` means "blind or disabled". A test row for each real state category showed it would also catch Louisiana's "Temporary disabling", which is a different thing | Test rules against every real example, not the examples you had in mind | `devlog/2026-11-01-m1-step4-categories.md` |
| 2026-11-01 | The first admin write routes passed every test and were in a PR, but lacked the cross-site request check the security doc promised. Rereading that doc before the next step caught it before merge | Reread the security plan when you add the first feature of a new kind; tests only check what someone remembered to write | `devlog/2026-11-01-m2-step2-watch-dates.md` |

## Numbers to collect

Start in M0; record per milestone in the devlog and total them here.

| Measure | How to get it |
| --- | --- |
| Hours of human time | Note start and end of each session |
| AI usage cost | Claude usage page / Console, per milestone |
| Hosting cost | Cloudflare billing page, monthly |
| Lines of code and of docs | `git diff --stat` per milestone |
| Tests and pass rate | `pnpm check` summary |
| States loaded, codes compared | Admin launch-readiness page |
| Usability results | `docs/usability.md` (M7) |
| Times the AI was wrong / a human was wrong, and how caught | Devlog "Corrections and surprises" |

## Running totals

| Milestone | Human hours | AI cost | Hosting | Notes |
| --- | --- | --- | --- | --- |
| Planning (2026-11-01) | not measured | not measured | $0 | Plan docs only |
| M0 step 1 (2026-11-01) | 0.1 (6 min) | not measured | $0 | Workspace, lint, typecheck |
| M0 step 2 (2026-11-01) | 0.2 (13 min) | not measured | $0 | Vue app, design tokens, light + dark |
| M0 step 3 (2026-11-01) | 0.4 (21 min) | not measured | $0 | Hono Worker, headers, strict CSP |
| M0 step 4 (2026-11-01) | 0.2 (14 min) | not measured | $0 | Test harness, `pnpm check`, theme menu; 21 tests |
| M0 step 5 (2026-11-01) | 0.2 (9 min) | not measured | $0 | Access JWT, site gate, robots.txt; 39 API tests |
| M0 step 6 (2026-11-01) | 0.3 (15 min) | not measured | $0 (public repo: free Actions) | CI, Dependabot, CodeQL, ruleset with no bypass |
| M0 step 7 (2026-11-01) | 0.2 (11 min build, plus account setup) | not measured | $0 | Cloudflare account, D1, R2, Access, CI deploys |
| M0 step 8 (2026-11-01) | 0.1 (8 min) | not measured | $0 | Builder agent; **M0 total ≈ 1.5 h of building** |
| M1 step 1 (2026-11-01) | 0.2 (12 min) | not measured | $0 | Schema, migrations, FTS5, drift check; 75 Vitest tests |
| M1 step 2 (2026-11-01) | 0.3 (17 min, incl. CodeQL fix) | not measured | $0 | Code normalization; 103 table-driven tests |
| M1 step 3 (2026-11-01) | 0.2 (12 min) | not measured | $0 | CMS reference codes: 107,173 rows, resumable loader |
| M1 step 4 (2026-11-01) | 0.1 (4 min) | not measured | $0 | Federal categories from the enacted law; keyword auto-mapping |
| M1 step 5 (2026-11-01) | 0.05 (3 min) | not measured | $0 | Pre-publish checks and diff; 21 tests |
| M1 step 6 (2026-11-01) | 0.05 (4 min) | not measured | $0 | Migrations and restore bookmark in the deploy; reference-data workflow |
| **M1 total** (2026-11-01) | **≈ 1.1 h** | not measured | $0 | 7 PRs; 276 tests (M0: 44); 107,173 reference codes |
| M2 step 1 (2026-11-01) | 0.1 (5 min) | not measured | $0 | Admin shell, audit log API and page; 17 new tests |
| M2 step 2 (2026-11-01) | 0.1 (8 min) | not measured | $0 | Watch dates page and banner; status.md table seeded into the app; CSRF write guard; 46 new tests |

## Assets to capture for slides

- Screenshot of a raw state PDF next to the same codes in the compare view.
- The checks screen stopping a wrong file.
- Before/after of the home map as states get added.
- A short screen recording of loading a state end to end.
