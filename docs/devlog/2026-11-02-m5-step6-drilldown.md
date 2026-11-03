# 2026-11-02: M5 step 6, category drill-down

**Milestone:** M5 step 6  •  **People:** none needed this step  •
**AI:** Claude Code, Opus main session (brief, review) and one builder agent (Opus)

Start 18:55 CST, end 19:30 CST (`date`). Builder: 18:56–19:28.

## Goal
One page per published unified category: its codes ranked by how many states list them, with
filters, a focus state, details per code, and the project lead's "Include codes no state lists".

## What happened
1. `/compare/<slug>` (Vue and server-rendered; bare page indexed and in the sitemap, any query
   `noindex`), `GET /api/public/categories/:slug` and `/detail`, `/compare/<slug>/codes.csv`.
   Counts come from SQL (placements, universes, exact/wildcard/range coverage).
2. Groups by ICD-10-CM category, sorted by count; filters (every state, gaps, only one state);
   system filter; focus column; details panel (a link and an anchor without JavaScript); pages
   of about 250 rows, a group never split. "Include codes no state lists" adds universe codes;
   disabled with a note when the category has no full code list.
3. A slow query found by measuring with real data: a cancer category (all 78 NEO groups) took
   3.4 s because SQLite scanned every published entry per prefix length. Reading wildcards once
   and fixing the join order (CROSS JOIN, MATERIALIZED CTEs): 0.04 s, same 4,064 matches.
4. Screenshots: a clipped focus column, the code scrolling out of view on phones, a missing space
   in a button's accessible name; fixed.
5. Deliberate break: "gaps" with `<=` failed 2 tests.

## Numbers (local, real data)
- Pages 32–78 ms, 69–150 KB; the cancer CSV with every code 140–155 ms, 248 KB.
- Tests: unit 485 (+15), component 184 (+9), API 253 (+18), e2e 43 (+4).
- AI cost: not measured. Hosting: Workers Paid.

## Corrections and surprises
- D1 binds JavaScript numbers as REAL: `n / ?` was not integer division.
- `rows`, `before` and `last` are SQLite keywords.
- CCSR places some codes in more than one group (e.g. substance-induced psychotic disorders), so
  a mental-illness category shows some F10–F19 codes. Expected; admins choose the CCSR groups.

## Open threads (for the M5 review)
- Retired categories answer 404, not a "retired" notice.
- The full-code CSV for a large category with 44 states would be ~85k cells.
