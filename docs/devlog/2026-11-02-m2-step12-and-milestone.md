# 2026-11-02: M2 step 12 and the end of M2 (ingestion admin)

**Milestone:** M2 (end)  •  **People:** project lead (review next)  •
**AI:** Claude Code, Opus main session; two subagents tested the AI cleanup prompt

Step 12: start 10:18 CST, end 10:19 CST (`date`).

## Step 12
`docs/add-state-source.md`: the admin path for a state's list, step by step, from what the
four seed states actually needed (tables and sheets, two columns with one name, tiers as files,
bare categories, undotted codes, drug classes, cut-off ranges, the wrong-file warnings). The
playbook's task table now points at it. Where the skill file lives is the project lead's call.

## M2 in one table

| Step | PR | What |
| --- | --- | --- |
| 1 | #20 | Admin shell, audit log |
| 2 | #21 | Watch dates page and banner |
| 3 | #22 | Source upload to R2 with hash and duplicate warning |
| 4 | #23, #25 | CSV/JSON/paste and Excel adapters, column mapping, saved profiles (+ `pnpm dev:stop`, #24) |
| 5 | #26 | PDF adapter (pdf.js, row rebuilding) |
| 6 | #27 | Review table, CMS lookup for codes; fixed `pnpm db:ref:local` |
| 7 | #28 | Draft versions per part, server checks, diff and CSV |
| 8 | #29 | Publish (token, typed confirmations, R2 backup) and rollback; the required safety tests |
| 9 | #30 | Category mapping and ICD-10-CM chapter overrides |
| 10 | #31 | AI cleanup: copy-paste prompt (tested by two subagents) and an optional Claude button (off) |
| 11 | #32 | Four seed states through the UI locally; wrong file stopped. Preview half open |
| 12 | #33 | The "add a state's list" guide |

## Numbers (end of M2)
- Vitest: unit 328, refdata 15, component 130, API 136, scripts 6 (615). Playwright: public
  e2e plus 9 admin e2e with axe in light and dark.
- Migrations on preview: 0002–0006. Production still has 0000–0001 (next `v*` tag is the
  project lead's call).
- Time on 2026-11-02 for steps 6–12: about 2 h 15 min (07:55 handoff to 10:19). AI cost: not
  measured. Hosting: $0 beyond the one-month Workers Paid plan. Claude API: $0 (no key).

## Questions for the project lead
1. Preview half of step 11 (your Access login): steps in `docs/status.md`, open question 0.
2. Where the "add a state source" skill file should live.
3. The run's assumptions (`docs/status.md`): bare 3-character codes as whole categories;
   qualification per state (GA A alone, GA B needs another code, MT Tier 2 and NE "state doesn't
   say", LA inferred 0/1/2). Legal team items as before.
4. A production release (`v*` tag) with M2, or wait for M3.
5. Turn on the Claude API button (cost estimate in `docs/deployment.md`), or keep copy-paste only.

## What a non-technical builder should take from M2
- The bugs that mattered showed up with real files, two things at once, or a real browser,
  not in unit tests. Each became a test once found.
