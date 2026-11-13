# 2026-11-12: ui-sdk, tooltips, matrix hover cards and the Overlaps tab

**Milestone:** M8 (alongside launch work)  •  **People:** project lead  •  **AI:** Claude Code,
Opus lead and three builders in worktrees

Start about 16:20 CST (the first file change was at 16:26), end 21:57 CST (`date`).

## Goal
Add the ui-sdk component library (vercel-labs/ui), then use it where it improves the
visualizations, and build the one view from the M5 research that was still missing.

## What happened
1. The project lead pasted ui-sdk's setup prompt. The packages were real but had been
   published that day, and pnpm's 3-day rule refused them. The project lead chose a narrow
   exemption for the two packages only (`pnpm-workspace.yaml`, remove after 2026-11-15).
2. The first `check:full` had 3 admin e2e failures. The lead first blamed ui-sdk's CSS, but
   the same tests then passed with the CSS in place. Leftover state from the failed run was the
   likeliest cause, and a clean run passed 271 of 271.
3. Evaluation: ui-sdk draws no charts. It offers tooltips, hover cards, popovers and
   disclosures. Three uses were picked, and the M5 research's UpSet set view was the one finding
   not yet built. The project lead asked for all three and for the theme CSS to go if it was
   not needed.
4. `web.css` came out: it only themes, and it puts site-wide rules on `a`, `code`, `kbd` and
   `hr`. Two things replace it: `@layer ui-sdk;` above Tailwind, and
   `<meta property="csp-nonce" content="none">`, so ui-sdk's small runtime CSS goes in as
   constructed style sheets that our `style-src 'self'` CSP allows.
5. Three builders ran in parallel:
   - `ui-tooltips`: the rule badges' `title` popups became ui-sdk Tooltips (hover, focus and
     tap). State abbreviations got spoken full names.
   - `matrix-hover-cards`: one shared HoverCard for the about 1,300 overview cells.
   - `upset-overlaps`: `/compare/overlaps`, its API, Worker HTML and an accessible table.
6. Lead review sent two builders back, once each (see below). Then the full suite passed, with
   277 e2e tests.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Install ui-sdk on main now, exempt from the 3-day rule until 2026-11-15 | Wanted it today | Project lead |
| No `web.css`; style parts with our tokens | Not needed; global rules on `a`/`code`/`kbd` | Project lead (AI recommended) |
| Overlaps as its own compare tab, not a section of the category page | The category page is already busy; Map is the pattern | AI (project lead may move it) |
| Badges in tables out of the Tab order; focusable only on code pages | A codes table can hold hundreds; the legend explains them | AI |
| Budgets for ui-sdk's two shared chunks (`popup.js`, `create-parts.js`) | Loaded on demand by compare and code pages only | AI |

## Corrections and surprises
- **The wrong culprit:** the first e2e failures looked like the CSS, because removing it made
  them pass. Re-running with it in place passed too. Re-run before you blame.
- **Hundreds of tab stops:** the first tooltip version made every badge a button. The builder
  had avoided this for abbreviations but not for badges. Lead review caught it.
- **Budgets:** builders do not run the budget stage, so all three reported "passes" while the
  merged build was over. Grouping ui-sdk into one named chunk pulled 50 KiB into the first load,
  so that change was reverted.
- **A 9px sideways scroll** at 320px on Overlaps: screen-reader-only labels (`position:
  absolute`) had no positioned ancestor. One `relative` fixed it.
- **A CSP check found an older report:** Zod tests `new Function` once per page. CSP blocks it
  (harmless; Zod falls back), and a violation is reported on every page, before today too.
  The project lead asked for Zod's `jitless` setting. Set in the web app's `main.ts`, it came too
  late: the bundler puts Zod and the shared schemas in a chunk that runs before `main.ts`. It now
  sits at the top of `packages/shared/src/index.ts`, and a new e2e test (`csp-clean.spec.ts`)
  fails on any CSP violation on four public pages.

## What a non-technical builder should take from this
- A test that fails once may not fail again. Run it again before you change code because of it.
- Ask for every limit a change could break (size, keyboard, small screens), not only "do the
  tests pass". Builders checked what they were told to check.

## Numbers
- About 5.5 hours in total. AI cost not measured.
- 53 files changed, about 2,400 lines added. 17 test files were touched or added: unit 727 → 745,
  component 328 → 356, API 621 → 632, e2e 271 → 281.
- First load 112.7 → 115.5 KiB brotli. ui-sdk adds 25.6 KiB on demand.

## Open threads
- Remove the ui-sdk exemption from `pnpm-workspace.yaml` after 2026-11-15 (add a watch date in
  `/admin/watch`).
- Legal: the new wording in `docs/legal-review.md` (Overlaps tab, matrix card lines).
- Code pages have no link to the badge legend when scripts are off (this was already so).
