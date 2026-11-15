# 2026-11-13: preview review, map cards, the state picker and v0.9.5

**Milestone:** M8 (alongside launch work)  •  **People:** project lead  •  **AI:** Claude Code,
Opus lead, one research agent and one builder in a worktree

Start about 14:20 CST, end 16:40 CST (`date`).

## Goal
Put yesterday's ui-sdk work (PR #114) on preview, act on the project lead's review of it, replace
the long state checkbox list on Compare single codes, and release to production.

## What happened
1. Zod's `jitless` setting ended the CSP report on every page. Set in the web app's `main.ts`,
   it came too late: the bundler runs the shared package's chunk first. It now sits at the top of
   `packages/shared/src/index.ts`, and `e2e/csp-clean.spec.ts` fails on any CSP violation.
2. Preview deploy, then three review comments from the project lead, fixed by the lead:
   - The home map's SVG `<title>` showed the map's name as a tooltip on every state. It is now
     the group's `aria-label`, which gives the same accessible name with no tooltip.
   - The home intro is context, not the focus: wider (`max-w-5xl`) and a size smaller, so the
     map sits higher.
   - The Map tab's tiles open the overview matrix's hover card for their state.
3. A research agent compared state pickers. It recommended GOV.UK's "option select": a
   disclosure with presets, a name filter and native checkboxes, over a chip combobox, map
   selection or abbreviation toggles (screen reader support, and the same markup works without
   JavaScript). The project lead answered its questions: alphabetical columns, no regions, open
   when empty, no maximum.
4. A builder built it, with a GET form on the Worker page (before, readers without JavaScript
   could not change the selection) and a 302 from repeated `states=` to one sorted parameter.
5. Merge review: a conflict with the Overlaps route (kept both), and two e2e tests that still
   expected pick order or focused the wrong element. Full suite: 287 e2e.
6. PR #114 merged; `v0.9.5` tagged.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| No tooltip on the home map, rather than one per state | The card beside the map already names the hovered state | AI (project lead offered either) |
| Map tab tiles use the matrix's card, not the home state card | The tile shows a category's number, as a matrix cell does | AI (easy to swap) |
| Disclosure with checkboxes, not a combobox | Best screen reader support; the same form works without JS | Project lead (AI recommended) |
| Columns alphabetical by state name; no maximum; open when empty; no regions | Simpler; readers can undo their own mistakes | Project lead |

## Corrections and surprises
- **A setting that looked set:** `z.config` in `main.ts` passed its unit test, but the e2e test
  showed the report still came. Bundled chunks do not run in import order across chunks.
- **Sorting by postal code is not alphabetical** (MO, MS, MT against Mississippi, Missouri,
  Montana). The sort uses the names.
- **A test that pressed Enter on text inside a `<summary>`** did nothing; Enter acts on the
  summary itself.

## What a non-technical builder should take from this
- Test the thing the reader sees (here, "no CSP report in the browser"), not only the setting
  behind it. The unit test passed while the problem stayed.

## Numbers
- About 2.3 hours. AI cost not measured.
- e2e 277 → 287; component 356 → 369; API 632 → 638; unit 745 → 752.
- First load 115.5 → 115.8 KiB brotli.

## Open threads
- Remove the ui-sdk exemption from `pnpm-workspace.yaml` after 2026-11-15.
- Legal: the picker wording, the Map tab card, and yesterday's Overlaps wording
  (`docs/legal-review.md`).
- The picker summary names 3 states before "and N more"; the 4-column grid starts at `lg`.
