# 2026-11-01: M0 step 6, GitHub CI and repo protection

**Session:** 2026-11-01 17:36–17:51 CST  •  **Milestone:** M0 step 6  •  **People:** project lead  •
**AI:** Claude Code, Opus main session, no subagents

## Goal

Set up GitHub so every change is checked before it reaches `main`: CI, Dependabot, CodeQL,
secret scanning, branch protection, plus `SECURITY.md`, `CONTRIBUTING.md` and README setup steps.

## What happened

1. The project lead merged PR #5 and asked to move on to step 6.
2. The AI read the supply-chain section, checked the repo's current settings (secret scanning
   and push protection were already on; Dependabot, private vulnerability reporting and CodeQL
   were off; no branch rules), Dependabot's pnpm 12 support and current Action releases. It
   proposed a plan with three questions.
3. The project lead chose **no bypass** on `main`, approved the repo settings, and asked for a
   data-error issue template.
4. The AI wrote the CI workflow (actions pinned to commit SHAs), Dependabot config (3-day
   cooldown to match pnpm's age guard), issue templates, `SECURITY.md`, `CONTRIBUTING.md` and the
   README setup steps, then turned on the repo settings through the GitHub API.
5. PR #6's CI passed on the first run: `check` 1m17s (all 8 stages), `audit` 13s, `gitleaks`
   10s. CodeQL scanned `main` with 0 results.
6. After merging, the AI added Actions to CodeQL, created the `main` ruleset, and tried a
   direct push to `main` on purpose. GitHub refused it (`GH013: Repository rule violations`).
   This devlog went in through a pull request.

## Decisions

| Decision | Why | Who decided |
| --- | --- | --- |
| Ruleset on `main` with no bypass, not even for admins | Every change goes through green checks; an admin can still edit the ruleset in an emergency | Project lead (AI recommended) |
| 0 required approvals | GitHub does not let the owner approve their own PR; checks are the gate | AI |
| CodeQL default setup instead of a workflow file | GitHub maintains it; nothing to keep up to date | Project lead approved (AI recommended) |
| Dependabot cooldown 3 days (7 for majors), grouped minor/patch | Matches pnpm's `minimumReleaseAge`; fewer PRs | AI |
| gitleaks as a second layer behind GitHub push protection | Scans full history in CI; free for a personal account | AI |
| Data-error issue template now | The README already invited issues; M7's "Report a problem" link will use it | Project lead |
| Docs follow-up as its own PR | The ruleset applies to the AI too; a good first test of it | AI |

## Corrections and surprises

- **CodeQL refused the "actions" language at first**: GitHub only offers it once workflow files
  exist on `main`. JavaScript/TypeScript went on first; Actions was added after the merge.
- **`docs/security.md` named an old pnpm setting** (`onlyBuiltDependencies`); pnpm 12 calls it
  `allowBuilds`. Fixed.
- **Dependabot security updates ignore the cooldown**, so a brand-new security release could
  fail CI's install under the 3-day guard. Documented: wait rather than add an exception.
- **If the repo moves to an organization** (one of the hosting options for launch), gitleaks
  needs a free license secret. Documented in `docs/security.md` and the workflow.
- CI was green on the first try, which the earlier local checks made likely.

## What a non-technical builder should take from this

1. Turn on branch protection early and include yourself. It stops "just this once" pushes that
   skip the checks.
2. After setting a rule, try to break it. Here, a deliberate direct push confirmed the
   protection works.

## Numbers

- Time: 15 minutes (17:36–17:51 CST), including about 2 minutes waiting for CI.
- Money: $0. GitHub Actions minutes are free for public repos. AI usage not measured.
- CI run time: about 1.5 minutes wall clock (`check` is the longest at 1m17s).
- Lines: about 350 lines of workflow, config, templates and contributor docs; about 50 lines of
  docs changed.

## Open threads

- Step 7: Cloudflare account setup with the project lead (API token for CI, Access application,
  `ADMIN_EMAILS` secret, service token for the smoke test), deploy job in CI.
- Old merged branches (`m0-step2-web` … `m0-step5-auth`) still exist on GitHub because
  auto-delete was off when they merged. Safe to delete if the project lead wants a tidy list.
