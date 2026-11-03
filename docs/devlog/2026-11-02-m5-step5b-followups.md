# 2026-11-02: M5 step 5b, follow-ups from the project lead's answers

**Milestone:** M5 step 5b  •  **People:** project lead (decisions earlier this evening)  •
**AI:** Claude Code, Opus main session (brief, review) and one builder agent (Opus)

Start 18:29 CST, end 18:51 CST (`date`). Builder: 18:30–18:49.

## What happened
1. **Federal category through unified categories.** `federalCategoriesOf()` replaces
   `federalCategoryOf()`: an entry placed in published unified categories takes their federal
   parents (a code in two counts under both); unplaced entries keep the M2 rule. Public reads
   use SQL subqueries on `entry_unified`. Changed: counts on the home card and state pages
   (with a note when they add up to more than the entries), the state page's category table
   (one row per federal category), downloads (`federal_categories`, `federalCategories`, renamed
   so no one reads one value per row), the code table's filter and "filed under", the admin
   categories screen ("N follow their unified categories").
2. **"Mappings confirmed":** every placed entry's placements reviewed, and every unplaced entry's
   M2 mapping manual or covered by a chapter override.
3. **Retiring a never-published draft** is allowed (no `data_version` bump).
4. **Admin sources list** looks up versions 100 source ids per query (bug: 108 files broke D1's
   100-parameter limit).
5. **Overview order in the URL** (`order`, `sort`, `dir`; defaults left out).
6. Deliberate breaks: keeping only the first federal parent failed 6 tests; a 200-id chunk
   failed the 108-source test.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Download fields renamed to plurals | A consumer must not read one value per row; pre-launch | AI (builder), accepted |
| A chapter override still confirms an unplaced entry | It is always set by an admin | AI, as before |

## Numbers
- Tests: unit 470 (+14), component 175 (+6), API 235 (+10).
- AI cost: not measured. Hosting: Workers Paid, $5/month.

## Open threads
- The M2 summary on the admin categories screen still counts fully placed categories.
- Time the home summary's subqueries on preview once states are mapped.
