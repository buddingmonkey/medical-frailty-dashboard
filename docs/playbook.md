# Playbook: changing this site with an AI assistant

For people who are **not** software developers (Medicaid agency staff, advocates, analysts,
volunteers) who want to improve this site with an AI coding assistant, Claude Code. You need
no coding knowledge. You do need to read what the AI tells you and answer its questions.

This playbook takes you from an idea to an open **pull request**: a proposed change that the
project's maintainers review. Words you may not know are in the [glossary](#9-glossary).

1. [What this project is, and what you can and cannot do](#1-what-this-project-is-and-what-you-can-and-cannot-do)
2. [Get set up](#2-get-set-up)
3. [Work with Claude Code](#3-work-with-claude-code)
4. [The basic loop](#4-the-basic-loop-works-for-any-change)
5. [Send your change: commit and pull request](#5-send-your-change-commit-and-pull-request)
6. [Habits that keep you safe](#6-habits-that-keep-you-safe)
7. [Common tasks](#7-common-tasks)
8. [Starting a similar project](#8-starting-a-similar-project-for-your-organization)
9. [Glossary](#9-glossary)

## 1. What this project is, and what you can and cannot do

The site compares the code lists that US states use to mark Medicaid members as "medically
frail". Medically frail members are exempt from the H.R.1 work requirements. All data is
public state policy.

**You can:**

- Run the whole site on your own computer, with sample data, including the admin pages.
- Change pages, text, tests and docs, and propose the change in a pull request.
- Report a wrong code with the
  [data error form](https://github.com/buddingmonkey/medical-frailty-dashboard/issues/new?template=data-error.yml),
  without installing anything.

**You cannot, and do not need to:**

- Put anything on the live site. The real site updates only after a maintainer merges your
  change, and production only after the project lead approves a release.
- Use the real admin pages. They are behind Cloudflare Access, a login that only listed
  admins pass.
- Get passwords, keys or a Cloudflare account. The site runs on your computer without them.

**The rules** (the full list is in [`CLAUDE.md`](../CLAUDE.md), "Rules"). Claude Code reads
them, but you are responsible for your change:

- **No patient data, ever.** Never add, paste or upload a member's name, ID, claim or any
  other personal information. Not in the code, not in a test, not in the chat with the AI.
- **CPT text is copyrighted** by the American Medical Association. The site shows only the
  description a state published, with a link to the state's document. Never add a table of
  CPT descriptions from anywhere else.
- **Admin stays behind the login.** Admin features live only under `/admin` and `/api/admin`.
- **No secrets in the repo.** It is public. Never put a password or key in a file or a message.
- **Tests first.** Each change starts with a test that fails, then the change that makes it
  pass.
- **Roles, not names.** Docs and notes in this public repo say "project lead" or "a
  volunteer", never a person's name or email.
- **Legal and policy wording is for the legal team.** The AI can research and draft. People
  decide.

## 2. Get set up

Follow [`getting-started.md`](getting-started.md) once. It covers, one step at a time:

1. A GitHub account and a Claude plan or API key.
2. A terminal: PowerShell on Windows, Terminal on macOS and Linux.
3. Git, the GitHub command line (`gh`), Node.js 26, pnpm 12.16.1, Claude Code and an editor.
4. Your own copy of the project (a fork), the packages, the local database and the site
   running at http://localhost:8787.
5. Your first question to Claude Code.

You are ready when `pnpm dev` shows the site in your browser and `claude` answers a question.

## 3. Work with Claude Code

### Start it

1. Open a terminal (on Windows, Terminal or PowerShell).
2. Go to the project folder: `cd ~/medical-frailty-dashboard`
3. Type `claude` and press Enter.

### What `CLAUDE.md` does

`CLAUDE.md` is the AI's instructions for this project. Claude Code reads it at the start of
every session. It lists the commands, the rules and which doc to read for each kind of task.
It is short on purpose and points to the docs in `docs/`. You do not need to edit it.

Other files you will hear about:

- `docs/status.md` says where things stand. **Ask the AI to read it first.**
- `docs/roadmap.md` breaks the work into small numbered steps.
- `docs/devlog/` records what happened in each session.
- `.claude/agents/builder.md` describes a helper. For a planned step, Claude Code may hand the
  work to a "builder" that works in its own copy of the project in the background, then
  reports back. You still talk with one assistant. For a small change you can say: "Make this
  change yourself in this session. Don't start a builder."

### Ask for a change

Describe the result you want in plain words, and who it is for. You do not need to name files.
Good first message:

```text
Read docs/status.md first. I want <the change> so that <who> can <do what>.
Don't write code yet. Tell me what you would change and ask me any questions.
```

### Permission prompts: what to approve

Before Claude Code edits a file or runs a command, it asks you. Read the command, then choose.
Press Esc to say no.

**Usually safe to approve:**

- Reading files and searching the project.
- Editing files inside the project folder.
- `pnpm check`, `pnpm test`, `pnpm format`, `pnpm dev`, `pnpm dev:stop`, `pnpm db:...:local`.
- `git status`, `git diff`, `git log`, `git switch -c`, `git add`, `git commit`.
- `git push` to **your own branch** on your fork, and `gh pr create`, when you are ready to
  send the change (section 5).

**Say no, or ask "why?" first:**

- Anything with `sudo`, `rm -rf`, `Remove-Item -Recurse`, `--force` or `git reset --hard`.
- Anything with `deploy`, `preview`, `pnpm cf` or `wrangler` on its own. These reach the real
  hosting. They fail without the project's keys, and you never need them.
- Installing a new package (`pnpm add`). Ask why it is needed and what it costs.
- Editing files outside the project folder, `CLAUDE.md`, `.github/` or `.claude/`.
- Anything that downloads and runs a script (`curl ... | bash`, `irm ... | iex`).
- Any command you do not understand. Ask: "What does this command do, in plain words?"

If you choose an option such as "don't ask again", Claude Code stops asking for that command.
Choose it only for the safe commands above.

### Stop it, undo, leave

- **Stop the AI mid-task:** press Esc. It keeps what it did so far. Then say what to do
  instead.
- **Go back to an earlier point:** press Esc twice with an empty prompt. A menu lets you
  restore the code and the conversation.
- **Plan without changes:** press Shift+Tab until the bottom line says plan mode. Claude Code
  then only reads and proposes.
- **Leave:** type `/exit`, or press Ctrl+D twice.

## 4. The basic loop (works for any change)

1. **Start fresh from `main`.** Ask: "Update my fork's main from upstream, then create a new
   branch named `<short-name>` for this change." (Or click **Sync fork** on your fork's GitHub
   page first.)
2. **Describe the outcome, not the code.** "Add a page that lists every state that has not
   published a list yet, with a link to its Medicaid site." Say who the page is for.
3. **Ask for a plan first.** "Don't write code yet. Tell me what you'd change and ask me any
   questions." Answer the questions. This is where most mistakes are prevented.
4. **Let it write a test first.** Ask it to show you that the new test fails before the
   change.
5. **Let it build one step,** then run `pnpm check`. Ask: "Did every check pass? Show me the
   summary." Each line starts with `ok` or `FAIL`. The last line should be
   `all checks passed`.
6. **Look at it.** Run `pnpm dev` (or ask the AI to), open http://localhost:8787 and click
   through. Check light and dark mode and a narrow window. If something looks wrong, say what
   you see.
7. **Read the change in plain terms.** Ask: "Show me the diff and explain each change in one
   plain sentence. Did you change anything I didn't ask for?" Lines with `+` were added; lines
   with `-` were removed. You can also see it with `git diff`, or in your editor.
8. **Ask for a devlog entry.** "Write the devlog entry for this session (template in
   docs/devlog/README.md). Roles, not names."

Then send it (section 5).

## 5. Send your change: commit and pull request

### Commit and push

Ask Claude Code:

```text
Commit the change with a clear message, push the branch to my fork (origin),
and open a pull request against buddingmonkey/medical-frailty-dashboard main.
Write the description in plain words: what changed, why, and how you tested it.
```

If you prefer to do it yourself:

1. `git status` lists the changed files. Check that each one belongs to this change.
2. `git add <file> <file>` picks the files to save.
3. `git commit -m "Add a page that lists states without a published list"` saves them with a
   message.
4. `git push -u origin <branch-name>` sends the branch to your fork.
5. `gh pr create --web` opens the pull request form in your browser. Check that the base is
   `buddingmonkey/medical-frailty-dashboard` `main`, fill in the description, and click
   **Create pull request**.

On the GitHub website instead of step 5: open your fork after the push. A yellow bar says your
branch had recent pushes. Click **Compare & pull request**.

**Success:** the pull request page shows your title, your description and a list of checks.

### The checks (CI)

Every pull request runs these automatically:

| Check | What it does |
| --- | --- |
| `check` | Everything in `pnpm check`, plus the build and the browser tests (`pnpm check:full`) |
| `audit` | Looks for known security problems in the packages the site uses |
| `gitleaks` | Looks for passwords or keys by mistake |
| CodeQL | GitHub's security scanner. Looks for code an attacker could misuse |

If this is your first pull request, the checks wait until a maintainer clicks **Approve and
run**. That is normal.

**A check failed?**

1. Ask Claude Code: "My pull request's checks failed. Use `gh pr checks` and
   `gh run view --log-failed` to find out why, explain it in plain words, and fix it test
   first."
2. When it has fixed it, approve the commit and push to the same branch. The pull request
   updates itself and the checks run again.
3. Never ask a maintainer to merge with a red check, even one that is "only" security.

If GitHub says the branch is out of date, click **Update branch** on the pull request page.

### Review

A maintainer reads your change and may leave comments. Answer them on GitHub, or paste them to
Claude Code: "A reviewer said: <comment>. Make that change." Push again. When the maintainer is
happy, they merge it.

**Who merges:** only maintainers merge into `main`. Merging updates the private preview site.
The public site changes only when the project lead approves a release.

## 6. Habits that keep you safe

- **Ask the AI to check facts against sources.** In this project, both a pasted explanation
  and a legal premise turned out wrong; asking for verification caught both
  (`docs/devlog/2026-11-01-planning.md`).
- **Never paste private data** (patient information, passwords, API keys) into the chat or the
  repo. This repo is public.
- **Small steps.** One feature per session. Long sessions get confused and cost more.
- **Legal and policy wording is not the AI's call.** It can research and draft; your experts
  decide.
- **Make the AI prove a test can fail.** A passing test proves nothing until you have seen it
  fail. In one step the AI broke the page on purpose (a blocked inline style) and checked that
  the browser test caught it (`docs/devlog/2026-11-01-m0-step4-tests.md`). Also check that the
  break really happened: in another step a first "proof" changed nothing, so it proved nothing
  (`docs/devlog/2026-11-01-m1-step1-schema.md`).
- **Let the security scanner block merges.** Once, every test passed, but CodeQL found three
  patterns an attacker could use to stall the server (`docs/devlog/2026-11-01-m1-step2-codes.md`).
- **Check each plan against the platform's documented limits.** A plan said to back up the
  database with an export the platform refuses for this kind of database. Asking the AI to
  read the official docs while planning caught it before anyone relied on that backup.
- **See colours before you approve them.** Ask for a swatch page that shows light and dark
  mode with contrast ratios. "Based on another site's branding" is fine for colours; its fonts
  and logo are licensed, so ask which ones you may use (`docs/devlog/2026-11-01-m0-step2-web.md`).
- **Look at the real page, not only the tests.** Twice a screenshot caught what every test
  passed: an invisible keyboard focus outline, and a table stretched out of shape.
- **Describe what you see, even when it sounds odd.** "The map bounces at the frame rate"
  pointed straight at a feedback loop: the summary box changed size, the page scrolled, and
  the mouse landed on another state (`docs/devlog/2026-11-03-m6-code-search.md`).
- **Ask a reviewer to read as one specific person.** "Could a state Medicaid analyst misread
  this?" found that "covers" and "qualifies" sounded like eligibility decisions. "Is this
  clear?" would not have (same devlog).

## 7. Common tasks

| Task | How |
| --- | --- |
| Add a new public page | The loop in section 4 with the prompt template below. Example to copy: the state page (`apps/web/src/pages/states/[slug].vue` and `apps/api/src/seo/pages/state.ts`) |
| Add a page with choices (filters, pickers) | Put every choice in the web address and read it back on load. Example to copy: the compare pages (`apps/web/src/pages/compare/`, `apps/web/src/lib/public-compare.ts`) |
| Fix a word or a typo | The loop in section 4. Say the page and the exact words |
| Report a wrong code | The [data error form](https://github.com/buddingmonkey/medical-frailty-dashboard/issues/new?template=data-error.yml). No setup needed |

**Admin tasks** need an admin login on the real site, which only listed admins have. You can
try them on your own computer at http://localhost:8787/admin with the sample data.

| Admin task | How |
| --- | --- |
| Load or update a state's code list | [`add-state-source.md`](add-state-source.md), step by step |
| Fix a wrong category mapping | Comparison categories: Admin → Mappings, choose the state. Federal categories: Admin → Federal categories, choose the new one, check the preview of what moves, then save |
| Roll back a bad upload | Admin → Versions → choose the state → Restore an earlier version |
| Add or close a watch date | Admin → Watch dates |
| Create a comparison category and map states to it | Admin → Unified categories (choose its CCSR groups, publish), then Admin → Mappings for each state (use the suggestion, save and approve) |
| Download a backup | Admin → Backup and restore → Download backup |

### Prompt template: add a public page

```text
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

What building the public pages taught:

- **A cache must know everything that shapes the page**: the data, the web build and the
  server code. A test that keeps showing old text is a cache problem until proved otherwise.
- **Test with the data a stranger would have.** A test passed on one computer only because its
  database already held data; in CI the database was empty. Each test setup now creates its
  own data.

## 8. Starting a similar project for your organization

What carried over from this project to any "compare public documents" site:

1. Write a one-page design wiki: what the site is for, who uses it, main features.
2. Collect real sample files before planning and give them to the AI.
3. Ask the AI for a plan in docs, with questions, before any code (see the 2026-11-01 devlog).
4. Choose hosting by cost first: free tiers go a long way for read-mostly public sites.
5. Keep a devlog from day one.

_(Setup steps, costs and time to be added when the project reaches launch.)_

## 9. Glossary

| Word | Meaning |
| --- | --- |
| Terminal | A window where you type commands. On Windows, Terminal or PowerShell |
| Command | A line you type in the terminal and run with Enter |
| Folder, project folder | Where the files are. For this project: `~/medical-frailty-dashboard` (`~` is your home folder; on Windows, `C:\Users\yourname`) |
| Git | The tool that keeps the history of every file |
| GitHub | The website that hosts the project's files and pull requests |
| `gh` | GitHub's command-line tool |
| Repository (repo) | All the project's files and their history |
| Fork | Your own copy of the repo on GitHub. You change your fork, then propose the change |
| Clone | A copy of a repo on your computer |
| `origin`, `upstream` | `origin` is your fork; `upstream` is the main project |
| Branch | A separate line of work, so your change stays apart until it is reviewed |
| `main` | The main branch. Protected: it changes only through reviewed pull requests |
| Commit | A saved set of changes with a message |
| Push | Send your commits to GitHub |
| Diff | The list of lines a change adds (`+`) and removes (`-`) |
| Pull request (PR) | A request to add your branch to `main`. It shows the diff, the checks and the review |
| Merge | Add a reviewed branch to `main`. Only maintainers do this |
| Maintainer | A person who can review and merge changes |
| CI | Continuous integration: checks GitHub runs on every pull request |
| Check | One automatic test of the change. Green passed, red failed |
| Test | Code that checks that other code does what it should |
| e2e test | End-to-end test: opens the real site in a test browser and clicks through it |
| Lint, typecheck, format | Automatic checks for mistakes and layout in code |
| CodeQL, gitleaks | Security scanners: CodeQL for risky code, gitleaks for leaked passwords |
| Node.js | The program that runs the project's tools |
| nvm | Installs and switches Node.js versions |
| pnpm | Installs the packages the project is built from, and runs its commands (`pnpm check`) |
| Package | Code someone else wrote that the project uses |
| Claude Code | The AI coding assistant this project uses. It reads, edits and runs commands with your OK |
| `CLAUDE.md` | The AI's instructions for this project |
| Permission prompt | Claude Code asking before it edits a file or runs a command |
| Builder, worktree | A helper AI that works on one step in its own copy of the project (a worktree) |
| Skill | Extra instructions you can add to Claude Code for one kind of work |
| localhost | Your own computer, as a web address. `http://localhost:8787` is the site running on it |
| Port | The number after `localhost:`. Only one program can use a port at a time |
| Database (D1) | Where the site keeps its data. Locally it is a file on your computer |
| Migration | A step that creates or changes the database's tables |
| Seed data | Sample data for testing: part of four states' real lists, and made-up lists for 40 others |
| Rebuild coverage | An admin button that recalculates the comparisons after new data |
| Cloudflare, Worker | The hosting company, and its kind of server program that runs the site |
| Cloudflare Access | The login in front of the admin pages and the preview site |
| Preview, production | The private test copy of the site, and the public site |
| Secret | A password or key. Never in the repo |
| `.dev.vars` | A local file for secrets on your computer. Contributors do not need one |
| Devlog | The project's diary: one entry per working session, in `docs/devlog/` |
| ICD-10-CM, HCPCS, CPT | Medical code systems: diagnoses, services and supplies, and procedures. CPT text is copyrighted |
| CCSR | A public grouping of ICD-10-CM codes into categories, from the federal agency AHRQ. The site uses it to suggest comparison categories |
| Comparison category | A category the site's admins define so different states' lists can be compared. The admin pages call them "unified categories" |
