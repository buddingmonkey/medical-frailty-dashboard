# 2026-11-02: Tabs between the comparison views

**Milestone:** after M5  •  **People:** project lead (chose tabs; asked for the map too)  •  **AI:** Claude Code, Opus lead and one builder in a worktree

Start 23:30 CST, end 23:58 CST (`date`).

## Why
The project lead couldn't find the five views from the M5 mockup. The header linked only to
the overview, and the overview's main link went to the old code table. A category page opened
only from a matrix cell, a 2–4 state comparison only from the form on a state page, and the
map lived only on the home page. Every view had been built, but you couldn't get to them.

## What happened
1. The tabs on every `/compare` page are Overview, Categories, Map, States side by side and
   Single codes. They're one list in `packages/shared/src/compare-tabs.ts`, shared by the Vue
   app and the Worker's HTML. They are links, not ARIA tabs. Deeper pages mark their parent
   tab with `aria-current="true"`.
2. Three new pages:
   - `/compare/categories` is indexed. The overview API now returns each category's
     definition for it.
   - `/compare/map` is indexed.
   - `/compare/states` is noindex. It starts from your state ("States like mine") or from a
     picker of 2–4 states.
3. Matrix column labels link to their category, and a separate "Sort by" button sorts.
4. Lead review: the Categories heading said "Categories we compare states by", the circular
   phrase the plain-language pass had just removed. It's now "Categories for comparing
   states", changed test first.
5. `pnpm check:full`, run by the lead at the merge, passed: 52 e2e tests with axe.

## Open threads
- `/compare/map?category=…` is indexed, with its canonical set to the bare page. Category-page
  views are noindex, so we may want those links to match. Left as built.
- The builder found that Bash commands combining `cd` with a heredoc were refused in the
  worktree. Separate commands worked.
