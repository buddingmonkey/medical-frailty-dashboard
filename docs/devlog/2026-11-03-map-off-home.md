# 2026-11-03: The tile map moves off home

**Milestone:** after M5  •  **People:** project lead (asked for the move)  •  **AI:** Claude Code, Opus lead and one builder in a worktree

Start 07:09 CST, end 07:25 CST (`date`).

## Why
With all 51 states seeded on preview, the project lead looked at the design and said the grid
map belongs on the compare screen, not the home page. The Map tab (`/compare/map`) already
showed it, so home had two maps, one of them a copy of a comparison view.

## What happened
1. Home keeps its state status map (Map/Table toggle, state card). The tile map section is
   gone from the Vue page and the server-rendered HTML. In its place, under States, is one
   link: "See one category across the country on the map" (`TILE_MAP_HOME_LINK`).
2. `/` no longer loads the overview, so the home page is back to one query.
3. Links from v0.5.0 like `/?category=cancer` go to `/compare/map?category=cancer`: a 301
   from the Worker, which runs before the page cache, and a `beforeRouteEnter` redirect in the
   Vue app. A bare `/` is not redirected.
4. The home tile tests moved to `apps/web/src/pages/compare/map.test.ts`, and the e2e tile
   tests moved from `home.spec.ts` to `compare.spec.ts`.
5. The builder ran `pnpm check`. The lead ran `pnpm check:full` at the merge: it passed, with
   53 e2e tests including axe.

## Open threads
- The new link text is on the legal list.
