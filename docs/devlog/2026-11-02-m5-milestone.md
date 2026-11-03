# 2026-11-02: end of M5 (compare across many states)

**Milestone:** M5 (end)  •  **People:** project lead (asked for it at 15:59, answered questions
along the way; review next)  •  **AI:** Claude Code, Opus main session (plan, specs, review) and
one research agent (Fable) plus eight builder agents (Opus)

## M5 in one table

| Step | PR | What |
| --- | --- | --- |
| Plan | #47 | Research, mockup, roadmap (code search → M6, admin → M7, launch → M8) |
| 1 | #48 | Unified categories and mappings (migration 0007), `unifiedOf()` |
| 2 | #49 | AHRQ CCSR v2026.1 (migration 0008), downloaded and pinned, never committed |
| 3 | #50 | Admin: unified categories, mappings with CCSR suggestions |
| 4 | #51 | Placements and universes (0009), `/api/public/overview` |
| 5 | #52 | Overview matrix at `/compare`; M4 table moved to `/compare/codes` |
| 5b | #53 | Federal categories through unified categories; follow-ups |
| 6 | #54 | Category drill-down, "Include codes no state lists" |
| 7 | #55 | Compare 2–4 states, similar states, pair similarity (0010) |
| 8 | #56 | Tile map on the home page |

**Check (roadmap):** every view has e2e tests with axe in both themes and a JavaScript-off
check; public numbers come from D1 queries, not per-request JavaScript.

## Numbers (end of M5)
- Vitest: unit 508, refdata 30, component 197, API 282, scripts 6 (1,023; M4 ended at 695).
  Playwright: 52 (was 31).
- Code and docs since the plan: 154 files, +24,989 / −321 lines (docs +793).
- Time: 15:59–20:40, about 4.5 h for the plan, 8 steps and reviews.
- AI cost: not measured. Hosting: Workers Paid, $5/month (kept by the project lead).

## What a non-technical builder should take from M5
- When a design stops scaling, ask for research and a clickable mockup before code.
- Write the spec first, hand one step to a builder, then review: three of eight reviews changed
  a rule (drafts in placements, "doesn't say" as a disagreement, the gaps threshold check).
- Test with the biggest real data: a 3.4 s query and a wrong "none listed" label showed up only
  there.

## Questions for the project lead
1. **Preview is empty until categories exist.** Create and publish unified categories (Admin →
   Unified categories) and approve mappings (Admin → Mappings). Want a starter set of ~17
   drafts from the mockup to edit and publish?
2. **Confirm two rules:** a "doesn't say" rule is no disagreement in the state comparison; a
   chapter override still confirms an unplaced code.
3. **Dark mode:** the "1–24%" and "no list" shades are nearly the same colour (text differs).
   Change the "no list" token?
4. **Release:** tag `v0.5.0`? Production then needs the CCSR load (Reference data workflow,
   ~67k rows, one run) after the deploy applies migrations 0007–0010.
5. **Legal list grew:** CCSR licence and citation; unified category labels; match words;
   overview, drill-down, comparison and tile-map wording (`docs/status.md`).
