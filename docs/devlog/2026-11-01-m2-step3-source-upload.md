# 2026-11-01: M2 step 3, source upload to R2

**Milestone:** M2 step 3  •  **People:** project lead (not involved in this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 23:04 CST, end 23:12 CST (`date`).

## Goal
Store each state's original file in R2, unchanged, with its SHA-256, and warn before a file
that is already stored is sent again.

## What happened
1. Found that the `states` table is empty in every database, so nothing could reference a
   state. Added migration `0003_seed_states`: the 50 states and DC, status `none`.
2. Shared: file types, a 25 MB cap, a first-bytes check (`%PDF-` in the first 1 KB, zip header
   for xlsx, no NUL bytes for text) and `sha256Hex` on Web Crypto, so the browser and the
   Worker compute the same hash with the same code.
3. API: the upload takes the raw file (the write guard allows `octet-stream` on this one
   route only, up to 25 MB). The Worker re-hashes the body, checks the type, returns the
   stored source on a duplicate, else writes R2 (random key, `attachment`), then the row and
   audit; if the row fails, the R2 object is deleted.
4. Web: `/admin/sources`. The browser hashes the file and asks the API before uploading; a
   duplicate shows "already loaded on <date> as version N" and no Upload button.
5. Broke a rule on purpose (removed the server's hash comparison): the hash test failed.
6. Hands-on with Georgia's real Attachment A (605 KB) in `pnpm dev`: upload, download
   (byte-identical, `GA-source-1.pdf`), duplicate warning on the second pick, axe clean in
   both themes. **The screenshot showed "Nov 2, 2026" at 23:10 CST on Nov 1:** the page cut the
   UTC timestamp to its date. Fixed with a local-time formatter; no other page did this.
7. Test lessons: a select's options load after the select appears (wait for the option);
   jsdom and Node have different `Uint8Array` classes (compare as arrays); the states test
   needed its own file because storage is isolated per file, not per test.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Seed all 50 states + DC now; territories an open question | Uploads need state rows; the M3 map shows every state | AI (territories: project lead) |
| Raw body with metadata in the query string, not multipart or base64 JSON | 25 MB files; no parsing on the server; logs already redact query strings | AI |
| A duplicate returns the stored source, no "upload anyway" | The table allows one row per state and hash; the stored copy is the same bytes | AI |
| Server checks the hash and first bytes, but never parses | Parsing stays in the browser (docs/security.md); the checks stop a mislabelled file | AI |

## Corrections and surprises
- The UTC-date bug above passed every test; only the screenshot caught it, because the
  session ran in the US evening.
- Stopping `pnpm dev` by port left `concurrently`, `wrangler` and `workerd` running. A
  `pnpm dev:stop` script would help; not added yet.

## What a non-technical builder should take from this
- Look at the real screen at a real time of day. Dates are a classic place for "works in
  tests, wrong for users".

## Numbers
- Time: about 8 minutes.
- AI cost: not measured. Hosting: $0 (R2 free tier: 10 GB).
- Tests: 26 unit, 11 API, 4 component new (unit 249, component 24, API 88, e2e 6).

## Open threads
- Step 4: parser adapters (xlsx/csv, json, paste) and column mapping.
- Territories (`docs/status.md`, open question 5).
