# 2026-11-01: M2 step 4, parser adapters and column mapping

**Milestone:** M2 step 4  •  **People:** project lead (not involved; one decision pending)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 23:15 CST, end 23:26 CST (`date`).

## Goal
Turn a state's file into rows in the admin's browser, and let the admin say once what each
column means.

## What happened
1. Shared `ingest.ts`: `RawTable`, column roles, `guessColumnRoles` (tested on the real GA,
   LA and MT header rows from `docs/sources.md`), `columnProfileSchema` (exactly one code
   column; other roles at most once; a column rule needs its column) and `applyMapping`.
2. Adapters in `apps/web/src/ingest/`: CSV and pasted tables through one linear-scan parser
   (quotes, doubled quotes, newlines in quotes; no regexes, so nothing for CodeQL), JSON arrays
   of objects. They run in a Web Worker in the browser and directly in jsdom tests.
3. **SheetJS for .xlsx was not installed.** The docs say to install it from the
   `cdn.sheetjs.com` tarball; Claude Code's auto mode refused a package from a URL outside the
   npm registry. Left for the project lead (`docs/status.md`, open question 6). The page tells
   admins to paste the cells or save as CSV meanwhile.
4. New table `column_profiles` (migration `0004`, generated and reviewed: one table, one
   index) and `GET/PUT /api/admin/column-profiles`, keyed by state and a normalized header key.
5. `packages/shared/src/qualification.ts` holds the badge labels, as `docs/data-model.md` asks,
   so the legal team's wording changes happen in one file.
6. `/admin/ingest`: state, file or paste, column roles with sample values, the qualification
   rule, a 20-row preview, and Save. A saved profile is found again for the same headers.
7. Broke a rule on purpose: let the guesser give a role to every matching column; the
   "first column only" test failed. Restored.
8. Hands-on in `pnpm dev`: a Montana-shaped CSV went through the real Worker (a separate
   `worker-*.js` in the build, allowed by the strict CSP), the profile saved and came back
   after a reload, axe clean in both themes, no console errors.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Native CSV parser instead of SheetJS for CSV | A small, tested, linear parser; no dependency for the common case | AI |
| Profiles keyed by state + normalized header row | "Next upload from the same state is one click" without asking the admin to name layouts | AI |
| Qualification values left "Not set" become `unknown` and are listed | The data model says qualification is "never guessed silently" | AI |
| A designation column defaults the rule to "from a column"; otherwise "Same for every row: State doesn't say" | Nothing is assumed; the admin chooses | AI |

## Corrections and surprises
- Stopping `pnpm dev` again took three rounds: `wrangler` restarts `workerd` when only the
  child is killed. Kill the `wrangler` parent first. A `pnpm dev:stop` script is still worth
  adding.

## What a non-technical builder should take from this
- When the AI's safety rules stop it, that is a decision for you, not a failure. Here it was
  "install code from a website instead of the usual package store?".

## Numbers
- Time: about 11 minutes.
- AI cost: not measured. Hosting: $0.
- Tests: 13 unit, 4 API, 16 component new (unit 262, component 40, API 92, e2e 6).

## Open threads
- Excel adapter, after the SheetJS decision.
- Step 5: PDF adapter (`pdfjs-dist` from npm, pinned, `isEvalSupported: false`).
