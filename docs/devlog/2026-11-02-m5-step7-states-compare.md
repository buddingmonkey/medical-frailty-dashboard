# 2026-11-02: M5 step 7, compare 2–4 states and states like mine

**Milestone:** M5 step 7  •  **People:** none needed this step  •
**AI:** Claude Code, Opus main session (brief, review, one rule change) and one builder agent

Start 19:33 CST, end 20:15 CST (`date`). Builder: 19:34–20:10.

## What happened
1. `/compare/states/ga-vs-la` (2–4 states, column order as given, always `noindex`, canonical
   alphabetical): only-in and shared counts, similarity for two states, only the differences
   grouped by unified category (toggle to show all), pickers, CSV;
   `GET /api/public/states-compare`.
2. "States with the most similar lists" on every state page (top 10, bars, pick up to 3).
3. `state_similarity` (migration 0010, filled at migrate time): Jaccard over expanded billable
   ICD-10-CM codes plus non-ICD entries; recomputed on publish and rollback (Nebraska: 52 ms,
   3 rows written).
4. Review change: Nebraska marks every code "State doesn't say", so the differs rule flagged all
   8,567 codes it shares with Georgia, and "only differences" hid nothing for the two most
   similar states. Now a rule a state doesn't state is no disagreement; two rules differ only
   when both are stated and disagree. Test first; 4 API expectations updated (one fixture row).
5. Screenshots: 23–311 px of sideways page scroll on phones from screen-reader-only text placed
   against the page; fixed. Deliberate break: dropping the rule clause failed 8 tests.

## Numbers (local, four seed states)
| Pair | Jaccard |
| --- | --- |
| GA–NE | 0.605 |
| GA–LA | 0.219 |
| LA–NE | 0.205 |
| GA–MT | 0.091 |
| MT–NE | 0.079 |
| LA–MT | 0.052 |

- GA vs NE: 0.22–0.27 s, 231 KB; four states 0.30 s. CSV for two states 1.7 MB.
- Tests: unit 498, component 192, API 281, e2e 47.

## Open threads (for the M5 review)
- Confirm the "doesn't say is no disagreement" rule.
- Each similarity recompute reads ~293k rows now, ~4M at 51 states; storing set sizes would cut
  it ~50×.
- New ICD-10-CM releases do not recompute similarity yet (same gap as placements).
