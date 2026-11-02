# 2026-11-01: M1 step 3, reference codes from CMS

**Milestone:** M1 step 3  •  **People:** project lead (not involved in this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 21:33 CST, end 21:45 CST (commit time). The first part overlapped with the
CodeQL fix on PR #13.

## Goal
`packages/reference-data`: build `ref_codes` (ICD-10-CM and HCPCS Level II, current year)
from CMS's public-domain files, and document the yearly update.

## What happened
1. First step under the new working agreement: no plan approval; the plan went into the chat
   and the work continued.
2. The AI downloaded both CMS files and counted them before designing anything: 98,403
   ICD-10-CM codes and 8,770 HCPCS codes, 107,173 rows. **That is more than D1's free tier
   writes in a day (100,000 for the whole account).** The design changed to fit: a
   `WITHOUT ROWID` table with no extra index (one write per row) and a loader that works in
   chunks, remembers what it loaded and stops at a daily budget.
3. Tests first on real excerpts of both files (13 tests, red, then green).
4. The first build on the full file **stopped at line 30,620**: FY2027 added `QA0` and `QA1`,
   the first ICD-10-CM codes with a letter in the second place. The parser fails loudly by
   design, so nothing was skipped. The same assumption sat in `codes.ts`, so a state listing
   `QA0.0101` would have been rejected as "not a code". Fixed in both, test first, allowing
   exactly `QA` so a category name like `SMI` is still not read as a code.
5. Local load: 22 chunks, ~20 s; a second run skips everything.
6. Checked the seed files against FY2027: GA misses 1 and 3 codes, LA 12 of 647 (1.9%), mostly
   WHO ICD-10 codes that ICD-10-CM does not have. Recorded in `docs/sources.md`.
7. A self-review caught a wrong count in the loader's summary line (always 0). Fixed before
   commit.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Full code sets, loaded over two days per database, $0 | The checks need every code; paying $5 for a month is the alternative (open question) | AI (recommendation recorded; project lead may override) |
| `ref_codes` is `WITHOUT ROWID`, no parent index, plus a `billable` column | One write per row; billable = 0 marks header codes, which states list to mean "the whole category" | AI |
| Generated SQL is not committed; the CMS files are pinned by SHA-256 | 107k rows of SQL would bloat the public repo; the build is reproducible | AI (roadmap said "seed SQL file") |
| Production loads only from CI | Same rule as production deploys | AI, following `CLAUDE.md` |
| Updates load only changes; the diff tool is built before the first update | A full reload would duplicate every code and cost two more days of quota | AI; watch date set for December 2026 |

## Corrections and surprises
- **The free tier's daily write limit nearly broke the plan.** The size of the reference data
  was not in any doc. Counting rows before designing turned it into a table setting and a
  resumable loader instead of a surprise on deploy day.
- **CMS changed the shape of ICD-10-CM codes this year.** `QA0`–`QA1` break the rule "letter,
  digit, ..." that both our parser and every summary of the format assume. A strict parser
  found it on the first run.
- **The roadmap's "seed SQL file" became a reproducible build** rather than a committed file.

## What a non-technical builder should take from this
- Ask "how big is the data, and what does the free plan allow per day?" before loading
  anything. Here the answer changed the design.
- A program that stops on anything unexpected is better than one that skips it. The stop is
  how we found CMS's new code format.

## Numbers
- Time: about 12 minutes.
- AI cost: not measured. Hosting: $0 (local only).
- Reference rows: 107,173 (22 chunks). Local load: ~20 s.
- Tests: 13 refdata (new), 148 unit (+24), 55 API (+1), 6 component; all passing.

## Open threads
- Open question: free two-day load per database, or $5 for one month.
- Diff loader for updates, before the January 2027 HCPCS file (watch date).
- M1 step 6: start the remote loads.
