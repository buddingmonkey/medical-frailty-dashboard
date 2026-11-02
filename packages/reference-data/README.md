# @mfcd/reference-data

Builds the `ref_codes` table (ICD-10-CM and HCPCS Level II, public domain) from CMS's own
files. Ingestion uses it to check that a state's codes exist, to tell billable codes from
header codes (a state that lists the header `F31.1` probably means everything under it), and
to settle `system_ambiguous` codes. No CPT: CPT belongs to the AMA (`docs/data-model.md`,
"Licensing of code text").

## Releases in use

| Release | File | Codes | Valid from |
| --- | --- | --- | --- |
| `icd10cm-fy2027` | CMS "2027 Code Descriptions in Tabular Order", `icd10cm_order_2027.txt` | 98,403 (74,879 billable) | 2026-10-01 |
| `hcpcs-2026-10` | CMS "October 2026 Alpha-Numeric HCPCS File" | 8,770 (1,322 terminated) | 2026-10-01 |

URLs and SHA-256 sums are pinned in `src/sources.ts`. The build refuses a file whose checksum
changed.

## Commands

```bash
pnpm db:ref:local                                         # build, then load into local D1 (~20 s)
pnpm --filter @mfcd/reference-data build                  # download (cached in .cache/), parse, write dist/*.sql
pnpm --filter @mfcd/reference-data load --local           # apply the chunks local D1 lacks
pnpm --filter @mfcd/reference-data load --env preview     # remote preview, up to 80,000 rows per run
```

Production is loaded only from CI: the **Reference data** workflow
(`.github/workflows/reference-data.yml`, run by hand, after approval). Outside GitHub Actions,
`load` refuses `--env production`.

## Free-tier limit (why loads are chunked)

D1's free tier allows **100,000 rows written per day for the whole account** (preview and
production together). The full set is 107,173 rows, so:

- `ref_codes` is `WITHOUT ROWID` with no secondary index: one write per row.
- The build writes 22 chunk files of up to 5,000 rows. Each chunk marks itself in `app_meta`
  (`ref_codes_chunk:<name>`), so `load` skips what is already there and stops before its row
  budget (`--max-rows`, default 80,000).
- The first remote load takes **two days per database**. Run `load` again after 00:00 UTC.
- Or pay for Workers Paid ($5/month) while loading. The project lead did this for one month on
  2026-11-01 (downgrade watch date in `docs/status.md`); the loader works the same either way.

## Updating

CMS publishes ICD-10-CM once a year (files in June, valid from 1 October; sometimes an
April update) and HCPCS every quarter (January, April, July, October). **Do not reload a whole
release:** the primary key includes `valid_from`, so a full new release would add ~107k rows
(another two days of quota per database) and duplicate every unchanged code.

The update path, to build before the first update is needed (watch date: HCPCS January 2027,
`docs/status.md`):

1. Add the new release to `src/sources.ts` (URL, SHA-256, member file, `validFrom`).
2. A diff step compares the new file with the codes already loaded and writes SQL for **new
   codes only** (new `valid_from`), sets `valid_to` on deleted codes, and updates changed
   descriptions in place. CMS's addenda files (`icd10cm_order_addenda_<year>.txt`, the HCPCS
   "Transaction Report") list exactly these changes and are a cross-check.
3. Load it like a normal chunk set, then run the ingestion checks for every published state:
   codes the update deleted show up as "not in `ref_codes`".

## Format notes

- ICD-10-CM order file: fixed width, CRLF, ASCII. FY2027 added the first codes with a letter
  in 2nd place (`QA0`, `QA1`, after `Q99` in chapter 17); the parser and
  `packages/shared/src/codes.ts` allow only `QA` there and fail on anything new.
- HCPCS: 320-character records, Latin-1. Long descriptions continue on record id 4; modifiers
  (record ids 7 and 8) are skipped. Layout: `HCPC2026_recordlayout.txt` in the zip.
