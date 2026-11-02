# 2026-11-01: M1 milestone, data foundation

**Milestone:** M1 (all six steps)  •  **People:** project lead  •  **AI:** Claude Code, Opus
main session (no builder agents)

Start 20:58 CST, end 22:05 CST (PC clock). PRs #12–#17, plus this one.

## Goal
Everything the site's data rests on, before any upload screen exists: the database schema,
code normalization, the national reference codes, the federal categories, the pre-publish
checks, and migrations in the deploy.

## What M1 delivered
| Step | What | PR |
| --- | --- | --- |
| 1 | Drizzle schema for every table, FTS5 search table, drift check in `pnpm check` | #12 |
| 2 | `codes.ts`: split, normalize, wildcards, ranges, code-system inference, code URLs, coverage | #13 |
| 3 | `packages/reference-data`: 107,173 ICD-10-CM and HCPCS codes from pinned CMS files, resumable loader | #14 |
| 4 | Federal categories from the enacted statute; keyword auto-mapping | #15 |
| 5 | Pre-publish checks, diff and confirmation gate | #16 |
| 6 | Restore bookmark and migrations in the deploy; Reference data workflow | #17 |

On preview: both migrations applied by CI (first run), and 80,000 of 107,173 reference rows
loaded on day 1 (the free tier's daily write limit). Production has not changed: it gets the
schema with the next `v*` tag, which needs the project lead's approval.

## How the work changed during M1
After step 1, the project lead asked the AI to stop waiting for approval on each step and to
merge on green CI, with a hard stop at the end of each milestone. Steps 2–6 ran that way. The
AI still asked one question when it mattered (state URL slugs) and wrote open questions into
`docs/status.md` instead of blocking on them.

## Corrections and surprises (the milestone's best material)
- **The plan's backup method was impossible.** D1 cannot export a database with a full-text
  search table. Found in Cloudflare's docs while planning step 1; replaced by Time Travel.
- **Real files beat summaries.** Profiling every code in the GA and LA files found six patterns
  the docs did not mention, including LA drug class codes that look like ICD-10 categories.
- **The security scanner caught what tests did not.** CodeQL failed PR #13 on three regexes an
  attacker could use to stall the server.
- **The national code list outgrew the free tier's daily write limit.** Counting rows first
  turned it into a table setting and a two-day load.
- **CMS changed the code format.** FY2027 added `QA0`–`QA1`; the strict parser stopped on line
  30,620, and the same wrong assumption was fixed in the state-list parser.
- **A planning-doc keyword was wrong** (`disab` would have mapped "Temporary disabling").
- **The AI guessed two devlog times** instead of reading the clock; corrected from commit times.

## Numbers
- Time: about 1 h 7 min of AI working time; the project lead answered three questions.
- AI cost: not measured. Hosting: $0.
- Tests: 197 unit, 13 refdata, 55 API, 6 component, 5 e2e (276 in all; M0 ended with 44).
- Reference rows: 107,173. Migrations: 2. Pull requests: 7.

## Open threads for the M1 review
1. **Production:** tag `v0.1.0` to apply the schema (approval in GitHub Actions), then run the
   Reference data workflow for production on two days.
2. **Preview:** run the Reference data workflow again after 00:00 UTC for the last 27,173 rows.
3. **Cost question:** keep the free two-day loads, or pay $5 for one month of Workers Paid.
4. **Legal review list** grew: federal category labels, LA drug class codes.
5. The diff loader for code-set updates must exist before the January 2027 HCPCS file.
