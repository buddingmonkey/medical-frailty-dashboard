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

## 5. Common tasks

| Task | How | Status |
| --- | --- | --- |
| Load or update a state's code list | Admin → Ingestion. Follow the checks screen; read every warning | _(to write after M2)_ |
| Fix a wrong category mapping | Admin → Category mapping | _(to write after M2)_ |
| Roll back a bad upload | Admin → state → Versions → Roll back | _(to write after M2)_ |
| Add or close a watch date | Admin → Watch dates | _(to write after M2)_ |
| Add a new public page | Use the loop in section 3; prompt template below | _(to write after M3)_ |
| Download a backup | Admin → Download backup | _(to write after M6)_ |

### Prompt template: add a public page _(refine after M3)_

```
Read docs/status.md and docs/architecture.md first.
I want a new public page: <what it shows> for <who>.
It should get its data from <existing API route, or "tell me if a new one is needed">.
Don't write code yet: list the files you'd add or change, the tests you'd write,
and any questions. After I approve, build it test-first and run pnpm check.
```

## 6. Starting a similar project for your organization

What carried over from this project to any "compare public documents" site:

1. Write a one-page design wiki: what the site is for, who uses it, main features.
2. Collect real sample files before planning and give them to the AI.
3. Ask the AI for a plan in docs, with questions, before any code (see the 2026-11-01 devlog).
4. Choose hosting by cost first: free tiers go a long way for read-mostly public sites.
5. Keep a devlog from day one.

_(Expand with the setup steps, costs and time once M0–M7 are done.)_
