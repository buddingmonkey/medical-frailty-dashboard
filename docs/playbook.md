# Playbook: building on this site with an AI assistant

For people who are **not** software developers (policy staff, advocates, analysts) who want
to add a page, a state or a feature to this site, or start a similar site for their own
organization, using an AI coding assistant such as Claude Code.

This playbook grows as the project does. Sections marked _(to write after Mx)_ get filled in
when that milestone is done, from what actually worked (see `docs/devlog/`).

## 1. What you need

- A computer with a terminal, Git and Node.js 26 (the LTS line; `.nvmrc` says `26`, so
  `nvm install && nvm use` picks it up).
- pnpm 12.16.1: `npm i -g pnpm@12.16.1`. Node 25 and later no longer ship corepack, so pnpm
  must be installed by hand. Then run `pnpm install` in the repo.
- An AI coding assistant (this project used Claude Code).
- Access to the GitHub repo. For deploying: a Cloudflare account (free). For admin pages: your
  Google account added to the admin list by an existing admin.
- No coding knowledge. You do need to read what the AI tells you and answer its questions.

## 2. How work is organized here

- `CLAUDE.md` is the AI's starting instructions. It is short on purpose and points to the
  docs in `docs/`. You rarely need to edit it.
- `docs/status.md` says where things stand. **Read it first, and ask the AI to read it first.**
- `docs/roadmap.md` breaks work into small numbered steps. One step = one AI session.
- `docs/devlog/` records what happened in each session.
- `.claude/agents/builder.md` is an optional helper agent. Once you and the AI agree a plan,
  the AI may hand the building to it. The builder follows the same rules, commits, and reports
  back. The main AI session still reviews its work and opens the pull request, so you deal with
  one assistant, not several.

## 3. The basic loop (works for any change)

1. **Describe the outcome, not the code.** "Add a page that lists every state that has not
   published a list yet, with a link to their Medicaid site." Say who the page is for.
2. **Ask for a plan first.** "Don't write code yet. Tell me what you'd change and ask me any
   questions." Answer the questions. This is where most mistakes are prevented.
3. **Let it build one step.** It should write a test first, then the change, then run
   `pnpm check`. Ask: "Did every check pass? Show me the summary line."
4. **Look at it.** Ask the AI to run the site locally (`pnpm dev`) or deploy a private preview,
   and click through it yourself. If something looks wrong, say what you see.
5. **Ask for a devlog entry**, then commit. "Write the devlog entry for this session and
   commit with a clear message."

## 4. Habits that keep you safe

- **Ask the AI to check facts against sources.** In this project, both a pasted explanation
  and a legal premise turned out wrong; asking for verification caught both
  (`docs/devlog/2026-11-01-planning.md`).
- **Never paste private data** (patient information, passwords, API keys) into the chat or the
  repo. This repo is public.
- **Small steps.** One feature per session. Long sessions get confused and cost more.
- **Legal and policy wording is not the AI's call.** It can research and draft; your experts
  decide.
- **Production deploys go through CI**, never by hand. Previews are private.
- **Make the AI prove a test can fail.** A passing test proves nothing until you have seen it
  fail. In step 4 the AI broke the page on purpose (a blocked inline style) and checked that the
  browser test caught it (`docs/devlog/2026-11-01-m0-step4-tests.md`). Also check that the
  break really happened: in M1 step 1 a first "proof" changed nothing, so it proved nothing
  (`docs/devlog/2026-11-01-m1-step1-schema.md`).
- **Let the security scanner block merges.** In M1 step 2 every test passed, but CodeQL found
  three patterns an attacker could use to stall the server. Never merge with a red check, even
  one that is "only" security (`docs/devlog/2026-11-01-m1-step2-codes.md`).
- **Check each plan step against the platform's documented limits.** The plan said to back
  up the database with an export the platform refuses for this kind of database. Asking the
  AI to read the official docs while planning caught it before anyone relied on that backup.
- **See colours before you approve them.** Ask for a swatch page that shows light and dark
  mode with contrast ratios. "Based on another site's branding" is fine for colours; its fonts
  and logo are licensed, so ask which ones you may use (`docs/devlog/2026-11-01-m0-step2-web.md`).

## 5. Common tasks

| Task | How | Status |
| --- | --- | --- |
| Load or update a state's code list | `docs/add-state-source.md`, step by step | Written (M2) |
| Fix a wrong category mapping | Admin → Categories: choose the federal category, Confirm | Written (M2) |
| Roll back a bad upload | Admin → Versions → choose the state → Restore an earlier version (two clicks) | Written (M2) |
| Add or close a watch date | Admin → Watch dates | Written (M2) |
| Add a new public page | Use the loop in section 3 with the prompt template below; the state page (`apps/web/src/pages/states/[slug].vue` + `apps/api/src/seo/pages.ts`) is the example to copy | Written (M3) |
| Add a page with choices (filters, pickers) | Put every choice in the URL and read it back on load; the compare page (`apps/web/src/pages/compare.vue`, `lib/public-compare.ts`) is the example to copy | Written (M4) |
| Download a backup | Admin → Download backup | _(to write after M6)_ |

### Prompt template: add a public page

```
Read docs/status.md, docs/architecture.md ("API shape", "Caching") and docs/seo.md first.
I want a new public page: <what it shows> for <who>, at the address <URL>.
It should get its data from <existing API route, or "tell me if a new one is needed">.
Don't write code yet: list the files you'd add or change, the tests you'd write,
and any questions. After I approve, build it test-first and run pnpm check.
The page must:
- put its words and number formats in packages/shared, so the Vue page and the
  server-rendered HTML say exactly the same thing;
- be rendered by the Worker too (title, description, canonical, JSON-LD, the facts),
  with an e2e test that reads it with JavaScript off;
- go through the public cache, and never show a draft.
Then show me screenshots in light and dark, on a phone width too.
```

What M3 taught about public pages:

- **Look at the real page, not only the tests.** Twice a screenshot caught what every test
  passed: a keyboard focus outline that was invisible, and a table stretched out of shape.
- **A cache must know everything that shapes the page**: the data, the web build and the
  server code. A test that keeps showing old text is a cache problem until proved otherwise.
- **Test with the data a stranger would have.** A test passed on the builder's computer only
  because its database already held data; in CI the database was empty. Each test setup now
  creates its own data.

## 6. Starting a similar project for your organization

What carried over from this project to any "compare public documents" site:

1. Write a one-page design wiki: what the site is for, who uses it, main features.
2. Collect real sample files before planning and give them to the AI.
3. Ask the AI for a plan in docs, with questions, before any code (see the 2026-11-01 devlog).
4. Choose hosting by cost first: free tiers go a long way for read-mostly public sites.
5. Keep a devlog from day one.

_(Expand with the setup steps, costs and time once M0–M7 are done.)_
