# 2026-11-02: M5 step 1, unified categories data model

**Milestone:** M5 step 1  •  **People:** none needed this step  •
**AI:** Claude Code, Opus main session (spec, review) and one builder agent (Opus)

Start 16:36 CST, end 16:47 CST (`date`). Builder: 16:39–16:44.

## Goal
Tables and the one placement rule for the middle level of categories: admin-curated unified
categories, and mappings from each state's own categories to them.

## What happened
1. The main session wrote the spec into `docs/data-model.md` ("Unified categories (M5)") and
   handed the step to the builder agent.
2. Builder, test first: five enums; migration `0007_unified_categories` (`unified_categories`,
   `unified_ccsr`, `unified_mappings`, with CHECKs for slug, federal parent, status,
   `by_code` ⇔ no target, and approved ⇒ reviewer and date); zod schemas; `unifiedOf()` with
   21 table-driven cases; 9 schema tests. Deliberate break: dropping the CCSR filter failed 3
   tests.
3. Review changed one rule. The builder dropped draft targets after the CCSR split, so a code
   mapped to a published and a draft category could show under none on public pages. Now
   unseen targets (retired, or draft on public pages) are dropped first.
4. The roadmap said the federal category would follow unified mappings; the spec left it open.
   The roadmap now says it is an open question (`docs/status.md`, question 5).

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| A state category with no approved mapping is placed code by code through CCSR, shown as not reviewed | GA and NE have no categories; their codes still appear in the many-state views at once | AI (spec) |
| Drafts and retired targets are dropped before the CCSR split | The public never loses an entry to an admin's work in progress | AI (review) |
| Duplicate approved mappings and `superseded_by` consistency are enforced by the admin API (step 3), not CHECKs | Superseding is a multi-row change; the API does it in one batch | AI |

## Corrections and surprises
- drizzle-kit names migrations at random; the repo renames them by hand (file and
  `_journal.json` tag). Now written down here.

## Numbers
- Tests: 39 new Vitest (shared 30, API 9). Totals: 410 unit + refdata, 152 component, 182 API.
- AI cost: not measured. Hosting: $0.

## Open threads
- Step 2: CCSR reference data. The migration reaches preview with this PR's deploy.
