# 2026-11-02: end of M3 (home page)

**Milestone:** M3 (end)  •  **People:** project lead (gave the go at 13:25; review next)  •
**AI:** Claude Code, Opus main session (no builder agents)

## M3 in one table

| Step | PR | What |
| --- | --- | --- |
| 1 | #37 | `GET /api/public/states`, edge cache keyed on `data_version` |
| 2 | #38 | Home map (51 shapes precomputed from us-atlas), state card, table view |
| 3 | #39 | State pages `/states/:slug` and their API |
| 4 | #40 | Server-rendered HTML for crawlers, `Dataset` JSON-LD, CSV/JSON downloads, sitemap |

**Check (roadmap):** `apps/web/e2e/no-js.spec.ts` reads Montana's page with JavaScript off and
finds its key facts (entries, date, qualification sentence, categories, source link,
canonical, JSON-LD). Passes locally and in CI; the preview deploy of #40 and its smoke test
passed (run 41518967153).

## Numbers (end of M3)
- Vitest: unit 333, refdata 17, component 141, API 161, scripts 6 (658; M2 ended at 615).
  Playwright: 24 public e2e (was 9 public + admin ones).
- Code and docs since `v0.2.0`: 52 files, +4,097 / −43 lines (about 2,400 of them the
  generated map paths); docs +262.
- Time: 13:25–14:26 on 2026-11-02, about 1 h for the four steps and the wrap-up.
- AI cost: not measured. Hosting: $0 (still the one-month Workers Paid plan; downgrade by
  2026-11-30).

## What a non-technical builder should take from M3
- Two screenshots caught what every test passed (an invisible focus outline, a stretched
  table). Look at the real page in both themes.
- A test that passes only on your computer is using something your computer happens to have.

## Questions for the project lead
1. **Release:** tag `v0.3.0` for production? Production has no state lists yet, and the whole
   site stays behind Access, so the public pages there would show 51 states with "No list
   yet" until lists are loaded (`docs/add-state-source.md`; ~110k writes for the four seed
   states: do it before the Workers Paid month ends on 2026-11-30, or over two days after).
2. **Legal team, two new items** (in `docs/status.md`): the licence of the compiled lists
   (left out of the `Dataset` JSON-LD), and the downloads, which carry each state's published
   descriptions, CPT text included, in bulk.
3. **Category mappings:** every state page says "Not yet confirmed" for every category until
   an admin confirms them on Admin → Categories. That is the launch criterion; no action
   needed now.
4. **Cache:** the shared edge cache only works on a custom domain, not `*.workers.dev`. Until
   M7 each page view reads D1 (~60 ms; fine at today's traffic).
