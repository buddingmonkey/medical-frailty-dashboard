# 2026-11-21: Connecticut's list, and what it needed from the ingest code

**Milestone:** M8 (between steps)  •  **People:** project lead  •
**AI:** Claude Code, Opus main session + four Opus builder agents in worktrees

Session: 14:51 to about 15:30 CST.

## Goal

Connecticut published its list as an xlsx. Find out what loading it would take, and change the
code so the next file like it loads without workarounds.

## What happened

1. The project lead sent the link ("New state dropped!"). The lead downloaded the file into a
   scratch folder and read it with a stdlib-only script (no Python xlsx package installed).
2. Profile: one sheet, a 13-row title block above the header, empty column A, 6,083 rows:
   5,684 ICD-10-CM, **374 NDC** and 25 HCPCS. No categories. A state draft (revision
   2026-11-04), effective 2027-01-01. Details in `docs/sources.md`, Connecticut.
3. Two blockers found in the code: `SHAPES.ndc` was `null` ("Add parsing when one does"), so
   every NDC row would have been a problem; and the spreadsheet parser took the first non-empty
   row ("Connecticut Department of Social Services") as the header.
4. Two builders started at once: NDC parsing (`ct-ndc-codes`) and header detection
   (`ct-xlsx-header`). Meanwhile the project lead answered three product questions (below).
5. A third builder added a federal override per code system (`system-overrides`, migration
   0018). The NDC builder reported that code search capped code-shaped queries at 8
   characters, so a fourth builder fixed search on top of its branch (`ct-ndc-search`).
6. Merged into `ct-ingest`. `pnpm check:full` failed one stage: the bundle budget, `ingest.js`
   about 1 KiB over. Cause: `parse.ts` imported a constant from `pdf-layout.ts`, which pulled
   the PDF layout module into the ingest chunk. The constant moved to `ingest/limits.ts`.
7. The real file was run through parse, map and review in a throwaway test: 6,035 of 6,083
   rows ready, 48 to review (bare 3-character codes), 0 problems.

## Decisions

| Decision | Why | Who decided |
| --- | --- | --- |
| Federal override per code system, beside the ICD chapter override | CT's NDC and HCPCS rows (all addiction treatment) share the blank category with the ICD rows, so a category mapping can't separate them; nothing invented is shown as the state's category | Project lead |
| Publish CT's draft, saying in the source title that it is a state draft effective 2027-01-01, with a watch date | The list is what the state has published; the watch date catches a final version | Project lead |
| NDCs stored as 11 digits, shown and linked as 5-4-2 (`00054-0176-13`) | The form pharmacists and FDA listings use; first NDC URL, so it is fixed now | Project lead |
| A 10-digit NDC without hyphens is a problem, never padded | Which segment lost its zero can't be known | Lead (house rule: never guess) |

## Corrections and surprises

- The header builder found its brief's rule wrong: the title line "…Exclusion Code List"
  matches the code-column pattern. A header row now also needs two filled cells and a short
  code cell. It stopped and said so rather than shipping the brief as written.
- A cross-module import of one constant cost 1 KiB in the admin bundle. The budget check caught
  it; unit tests could not.
- 64 of CT's ICD-10-CM codes were retired years ago (old `S06` 7th characters, `T40.4X-`).
  The review shows them as "Not in the CMS lists"; it does not block.

## What a non-technical builder should take from this

- When a new state's file arrives, look at it before uploading: a title block, a new code
  system or missing categories each needs a code change, and finding them first is cheaper.

## Numbers

- Tests: unit 848, component 415 (5 skipped), api 670, e2e 287 at the merge.
- Changes: about 50 files, one migration (0018). Money: not measured.

## Open threads

- **Release:** migration 0018 needs a tag and the project lead's approval before CT can be
  loaded on production with the code-system override.
- **Load CT** on production through the admin screens: map Code Type → Code system, Code,
  Code Description; qualification "Enough by itself (stated by the state)"; decide the 48 bare
  3-character codes and the 90 codes with children; after publishing, set NDC and HCPCS →
  Substance use disorder under "Override by code system".
- A restore from a backup made before 0018 clears a state's system overrides (it replaces
  with the backup's, and the diff shows it).
- Search: typing `00054-0176-1` shows the 5-4-1 NDC while someone is still typing `-13`.
- `parseConditionMember` accepts NDC members through the API, though the form hides NDC.
- The text export for the AI assistant leaves out an xlsx's title rows.
