# 2026-11-02: end of M4 (compare by category)

**Milestone:** M4 (end)  •  **People:** project lead (gave the go at 14:57; review next)  •
**AI:** Claude Code, Opus main session (no builder agents)

## M4 in one table

| Step | PR | What |
| --- | --- | --- |
| 1 | #42 | `GET /api/public/compare`: one category aligned across states; listed / covered / narrower / not listed / no list per cell |
| 2 | #43 | `/compare` page (URL holds the selection), CSV of every row, server-rendered `noindex` HTML, "Compare" links |

**Check (roadmap):** pick a category and states, read the aligned table with each state's tier
and badge, filter to "qualifies alone", share the URL, export CSV; compare is `noindex`.
`apps/web/e2e/compare.spec.ts` covers each part (axe clean), including the page with
JavaScript off. Real data: GA, LA, MT, NE on `pnpm dev`.

## Numbers (end of M4)
- Vitest: unit 353, refdata 17, component 148, API 171, scripts 6 (695; M3 ended at 658).
  Playwright: 28 e2e (was 24).
- Code and docs in M4: 30 files, +2,700 / −7 lines; docs +145.
- Time: 14:57–15:32 on 2026-11-02.
- Worst case on real data: all four seed states, every unclassified entry, 8,764 rows; ~170 ms
  per request locally, D1 included.
- AI cost: not measured. Hosting: $0 (Workers Paid month still running).

## What a non-technical builder should take from M4
- Put every choice in the URL: sharing, the back button and server rendering then come free.
- Breaking a rule on purpose and seeing nothing fail can mean the rule does nothing.
- Know your free tier's limits before the feature ships: here, 10 ms of CPU per request.

## Questions for the project lead
1. **CPU on the Free plan.** The compare route does the most work per request on the site
   (worst case ~20 ms of JavaScript in Node; the Free plan allows 10 ms of CPU). Before the
   downgrade on 2026-11-30, open one large comparison on preview in your signed-in browser
   (e.g. `/compare?states=GA,LA,MT,NE&category=unmapped`, once preview has the four states), then
   read its CPU time in Workers Logs; I can do it in your Chrome if you sign in to Access. If it
   is over, the options are: stay on Workers Paid ($5/month), cache compare results in D1 per
   `data_version`, or a custom domain so the edge cache serves repeats.
2. **Wording (provisional, for the legal list):** the cell words ("Listed", "Covered by a broader
   entry", "Narrower codes listed", "Not listed") and the legend on the compare page.
3. **Still open from M3:** a `v0.3.0` (now `v0.4.0`) release tag; the two legal items (licence of
   the compiled lists; bulk downloads with CPT text, which the compare CSV now also carries).
