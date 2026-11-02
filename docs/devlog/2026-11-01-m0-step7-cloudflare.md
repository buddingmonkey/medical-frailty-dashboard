# 2026-11-01: M0 step 7, Cloudflare and deploys from CI

**Session:** 2026-11-01 20:14–20:25 CST (build), after an account-setup stretch with the project
lead (start not recorded)  •  **Milestone:** M0 step 7  •  **People:** project lead  •
**AI:** Claude Code, Opus main session, no subagents

## Goal

Create the Cloudflare side (Workers, D1, R2, Access for both hosts) and deploy from CI, so
both URLs ask for a Google login and show the placeholder page after it.

## What happened

1. **Account setup, with the project lead.** The AI gave a step-by-step list of the
   Cloudflare and GitHub work only the project lead could do. The project lead already had a
   Cloudflare account and Zero Trust team used by another project. The AI inspected it and
   recommended a **dedicated account**, because the site may be given to an organization
   later and Cloudflare API tokens can only be limited to a whole account. The project lead
   created one.
2. The project lead asked whether logging wrangler into the new account would break the other
   project's login. It would: `wrangler login` is one login per computer. The AI proposed a
   **per-repo token** instead (`apps/api/.env.cloudflare`, gitignored) and the project lead
   set it up, plus Google login, the Access policy, a CI service token and the GitHub
   `preview` secrets. The AI checked each through the API.
3. The AI's Cloudflare connection had no Zero Trust permissions at first (every Access call
   returned 403). The project lead reconnected it with Access scopes.
4. The AI proposed the plan with four questions. The project lead approved a `v0.0.1` tag for
   the first production deploy, committing D1 IDs for now (moving them to deploy-time
   variables before M7), and setting `ADMIN_EMAILS` by hand later. They asked how to copy
   GitHub secrets to another environment: that isn't possible, so the AI gave commands to
   recreate them, with a separate token per environment.
5. Tests first: a new test showed that an unset Access secret crashed instead of returning
   401. Fixed.
6. The AI added `pnpm cf` (wrangler with the repo token, refusing production deploys), created
   the D1 databases, R2 buckets and both Access applications, set the GitHub environment
   variables, and limited `preview` to `main`.
7. A hand deploy of preview from the branch worked. Every path, and a forged token, redirected
   to the Google login.
8. CI: a reusable `deploy.yml` (build, deploy with Access secrets, smoke test), called on
   `main` for preview and on `v*` tags for production (after approval). `pnpm check:full`
   passes: 5 unit, 6 component, 41 API, 5 E2E.

## Decisions

| Decision | Why | Who decided |
| --- | --- | --- |
| Dedicated Cloudflare account | Tokens can't be limited below an account; the site may be handed over | Project lead (AI recommended) |
| Per-repo token in `.env.cloudflare`, used through `pnpm cf` | Leaves the computer's global wrangler login to the other project | Project lead (AI recommended) |
| `pnpm cf` refuses `deploy`/`rollback` without `--env preview` | The "production only from CI" rule is enforced in code, not only in `CLAUDE.md` | AI |
| `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` as Worker secrets, uploaded by CI from GitHub environment variables | Out of the public repo; a new host changes settings, not code; production works on its first deploy | AI (plan change, reported) |
| One CI token and one service token per environment | Each can be revoked alone; GitHub secrets can't be copied anyway | Project lead (AI recommended) |
| Commit D1 IDs now, deploy-time variables before M7 | IDs aren't secret; portability later | Project lead |
| First production deploy by tagging `v0.0.1` | Matches the documented release flow and needs the project lead's approval | Project lead |
| Migrations and pre-release D1 backup move to M1 | No migrations or data yet | AI |

## Corrections and surprises

- **A doc promised something Cloudflare can't do:** "an API token limited to these Workers,
  D1 databases and R2 buckets". Tokens can only be limited to an account. Fixed, and it is
  why a dedicated account matters.
- **"Leave Block AI bots off" had nothing to switch off:** workers.dev hosts have no zone, so
  the setting only appears with a domain.
- **wrangler 4.156.1 came out the same day** and was too new for the 3-day rule; stayed on 4.156.0.
- **The AI's plan changed after approval:** it found wrangler's `--secrets-file`, which
  uploads secrets with each deploy. That removed a hand step and a 401 window on production's
  first deploy. Reported before building on it.
- **Downloading a workflow linter was blocked** by the session's safety rules (code from the
  internet). The workflows were checked as YAML only; CI validates them for real.
- **The first CI smoke test failed without an error message** (PR #9). `read` returns 1
  when its input has no trailing newline, and `set -e` ended the step. Fixed with a `\n` in curl's
  output format. Linting would not have caught it: it is valid shell.
- **The first production deploy's smoke test got Cloudflare error 1042** (404): a brand-new
  Worker can take up to a minute to answer on workers.dev, and the test retried for only 15 s.
  A re-run passed; retries now last about a minute (PR #10). Preview missed this because it
  had been deployed by hand first.
- The project lead installed actionlint (checksum-verified) after the AI's own download was
  blocked; both workflows lint clean.
- The session's safety rules also stopped the AI from merging a PR the project lead had not
  named. The project lead then said "merge 9 yourself".

## What a non-technical builder should take from this

1. Before reusing an account "because it's already set up", ask who else uses it and who
   might own the project later.
2. Rules in a document can be forgotten. Where it is cheap, put the rule in a script that
   refuses the wrong action.

## Numbers

- Time: 11 minutes of building (20:14–20:25 CST), plus the account setup before it.
- Money: $0. Workers, D1, R2 and Access are all on free tiers. AI usage not measured.
- Tests: 1 added (41 API tests).
- Lines: about 250 lines of workflow, script and config; about 120 lines of docs.

## Open threads

- Done after the merge: production secrets and `ci-smoke-prod` policy; preview and
  production (`v0.0.1`) deployed from CI with passing smoke tests.
- Project lead: check both URLs in a browser (the step's acceptance check).
- Project lead: set `ADMIN_EMAILS` on both Workers with `pnpm cf secret put`.
- Before M7: D1 IDs as deploy-time variables. M1: migrations and backup in the deploy.
- Service tokens expire November 2027.
