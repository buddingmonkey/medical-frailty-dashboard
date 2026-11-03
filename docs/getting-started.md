# Getting started: from the GitHub page to the site running on your computer

This guide is for people who have never used a terminal. It takes you from your first look at
this project on GitHub to the whole site running on your own computer, with Claude Code (an
AI coding assistant) ready to help. The next guide, [`playbook.md`](playbook.md), shows how to
make a change and send it to the project.

- **Time:** plan for one to two hours the first time. Most of it is waiting for downloads.
- **Cost:** everything here is free except Claude Code, which needs a paid Claude plan or an
  API key (step 2).
- **Words you don't know** are in the [glossary](playbook.md#9-glossary).

Every step says what to type and what you should see. If you see something else, stop and
look in [Troubleshooting](#troubleshooting) at the end.

## How to type a command

A **terminal** is a window where you type commands instead of clicking.

1. Open the terminal (step 3 says which one for your computer).
2. Copy the command from this guide. Copy only the text in the grey box.
3. Paste it into the terminal. On Windows, press Ctrl+V or right-click. On macOS, press
   Cmd+V. In a Linux terminal, press Ctrl+Shift+V or right-click.
4. Press Enter.
5. Wait until the terminal shows a new line that ends with `>` (Windows), `%` (macOS) or `$`
   (Linux). That means it is ready for the next command.

Most commands are the same on every computer. Where they differ, the guide shows a
**Windows** box and a **macOS and Linux** box. Use only the one for your computer.

When a command on macOS or Linux asks for your **password**, type your computer password and
press Enter. Nothing appears while you type. That is normal. On Windows, a window may ask
"Do you want to allow this app to make changes?" instead. Click **Yes**.

## Step 1. Look at the project on GitHub

1. Open https://github.com/buddingmonkey/medical-frailty-dashboard in your browser.
2. Scroll down. You see the README, which says what the site is for.

The list of folders at the top is the **repository** (repo): every file of the site. You can
read any of them in the browser. You cannot change them directly. Every change goes through a
**pull request** that a maintainer reviews.

**Only want to report a wrong code?** You do not need any of this guide. Use the
[data error form](https://github.com/buddingmonkey/medical-frailty-dashboard/issues/new?template=data-error.yml)
with the state, the code and a link to the state's document.

## Step 2. Make the accounts

### A GitHub account (free)

1. Go to https://github.com/signup and follow the steps.
2. Turn on two-factor authentication when GitHub asks.
3. Go to **Settings → Emails** and tick **Keep my email addresses private**. Note the address
   that ends in `@users.noreply.github.com`. You use it in step 4. This repo is public, and
   every change you send shows the email address you set up.

**Success:** you can sign in at https://github.com and see your profile picture top right.

### A Claude plan or an API key (paid)

Claude Code needs one of these:

- **A Claude subscription:** Pro, Max, Team or Enterprise. The free Claude plan does not
  include Claude Code. You pay a fixed amount each month, and each plan has usage limits.
- **An API key from the Claude Console** (https://platform.claude.com). You pay for what you
  use. Set a monthly spend limit in the Console before you start.

Prices change, so check https://claude.com/pricing (plans) and https://claude.com/pricing#api
(API). If your employer has a Team or Enterprise plan, ask them for a seat.

**Success:** you can sign in at https://claude.ai (subscription) or https://platform.claude.com
(API key).

## Step 3. Get a terminal

### Windows: PowerShell

Windows 10 or 11 works as it is. You do not need WSL or Linux.

1. Click Start, type `Terminal` and press Enter. (On Windows 10 without Terminal, type
   `PowerShell` and open **Windows PowerShell**.) Do not choose "Run as administrator".
2. Allow the tools you install in the next steps to run. Type this and press Enter:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

   If it asks a question, type `Y` and press Enter. This changes a setting for your own
   account only. Without it, `pnpm` stops with "running scripts is disabled on this system".

**Success:** the window shows a line like `PS C:\Users\yourname>`.

Every command in these guides goes in this window. Keep the project in your own folder
(step 10 does this for you), not in OneDrive or on a network drive.

**Prefer WSL?** It works too. Install it (https://learn.microsoft.com/en-us/windows/wsl/install),
then follow the **Linux** steps in the Ubuntu window, and keep the project inside Ubuntu (`~`),
not under `/mnt/c/`.

### macOS

Press Cmd+Space, type `Terminal` and press Enter.

**Success:** a window shows a line that ends with `%`.

### Linux

Open the **Terminal** app from your applications menu. These guides assume Ubuntu or Debian.
On another Linux system, use its own package manager where these guides say `apt`.

## Step 4. Install Git

**Git** keeps the history of every file and sends your changes to GitHub.

- **Windows:**

  ```powershell
  winget install --id Git.Git -e --source winget
  ```

  Then close the terminal and open a new one, so it finds Git.

- **Linux:**

  ```bash
  sudo apt update && sudo apt install -y git curl
  ```

- **macOS:** type `git --version`. If Git is missing, macOS offers to install the
  "command line developer tools". Click **Install** and wait.

**Check it worked:**

```text
git --version
```

You should see `git version 2.` and more numbers.

Now tell Git who you are. Use the private GitHub email from step 2:

```text
git config --global user.name "Your Name"
git config --global user.email "12345678+yourname@users.noreply.github.com"
```

Official page: https://git-scm.com/downloads

## Step 5. Install the GitHub command line (`gh`) and sign in

`gh` lets you (and Claude Code) copy the project, send changes and open pull requests from
the terminal.

1. Install it:
   - **Windows:** `winget install --id GitHub.cli -e --source winget`, then close the
     terminal and open a new one.
   - **Linux:** follow the "Debian, Ubuntu" steps on
     https://github.com/cli/cli/blob/trunk/docs/install_linux.md. Paste the whole block.
   - **macOS:** install Homebrew from https://brew.sh (follow the steps it prints at the
     end), then run `brew install gh`.
2. Check it worked: `gh --version` shows `gh version 2.` and more numbers.
3. Sign in:

   ```text
   gh auth login
   ```

   Answer the questions with the arrow keys and Enter: **GitHub.com**, **HTTPS**, **Yes**
   (authenticate Git with your GitHub credentials), **Login with a web browser**. It shows a
   one-time code. Copy it, press Enter, and paste the code on the page that opens. If no
   browser opens, go to https://github.com/login/device yourself.

**Check it worked:**

```text
gh auth status
```

You should see `Logged in to github.com account yourname`.

## Step 6. Install Node.js 26

**Node.js** runs the site's tools. This project needs **version 26**.

### Windows

```powershell
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

Close the terminal and open a new one. If `node --version` (below) shows a number other than
`v26`, uninstall that Node (Start, Settings, Apps), then download the **v26** Windows
installer (`.msi`) from https://nodejs.org/en/download and run it.

### macOS and Linux: with nvm

**nvm** installs the right version and lets you switch later.

1. Open https://github.com/nvm-sh/nvm#installing-and-updating and copy the `curl` install
   command shown there. It looks like this (the version number may be newer):

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
   ```

2. Close the terminal and open a new one.
3. Check nvm: `command -v nvm` prints `nvm`.
4. Install Node 26 and make it the default:

   ```bash
   nvm install 26
   nvm alias default 26
   ```

Do not install Node from the Node.js website or with `sudo apt install nodejs` as well. Two
copies of Node cause the errors in [Troubleshooting](#troubleshooting).

### Check it worked

```text
node --version
```

You should see `v26.` and more numbers.

## Step 7. Install pnpm 12.16.1

**pnpm** downloads the packages the site is built from. This project uses exactly version
12.16.1. Node 26 no longer includes the tool (corepack) that used to install pnpm, so you
install it yourself:

```text
npm install -g pnpm@12.16.1
```

**Check it worked:**

```text
pnpm --version
```

You should see `12.16.1`.

Official page: https://pnpm.io/installation

## Step 8. Install Claude Code and sign in

1. Install it:
   - **Windows:**

     ```powershell
     irm https://claude.ai/install.ps1 | iex
     ```

   - **macOS and Linux:**

     ```bash
     curl -fsSL https://claude.ai/install.sh | bash
     ```

   It shows no progress while it downloads. Wait for the prompt to come back.
2. Close the terminal and open a new one.
3. Check it worked:

   ```text
   claude --version
   ```

   You should see a version number followed by `(Claude Code)`. If it says
   `command not found`, see [Troubleshooting](#troubleshooting).
4. You sign in the first time you start it, in step 13.

Official page: https://code.claude.com/docs/en/setup. A guide for terminal beginners:
https://code.claude.com/docs/en/terminal-guide

## Step 9. Install an editor (optional)

You do not need an editor: Claude Code edits the files for you. An editor helps you read the
files and the changes. **Visual Studio Code** is free: https://code.visualstudio.com

Install it, then open the project folder from the File menu. (With WSL, add the **WSL**
extension too: https://code.visualstudio.com/docs/remote/wsl.)

## Step 10. Copy the project to your computer (fork and clone)

You cannot change the main project directly. `main`, its main branch, is protected: every
change goes through a pull request. So you make your own copy on GitHub (a **fork**), and
then copy your fork to your computer (a **clone**).

1. Go to your home folder:

   ```text
   cd ~
   ```

2. Fork and clone in one command:

   ```text
   gh repo fork buddingmonkey/medical-frailty-dashboard --clone
   ```

3. Go into the project folder:

   ```text
   cd medical-frailty-dashboard
   ```

**Check it worked:**

```text
git remote -v
```

You should see two names: `origin` (your fork, with your GitHub name in the address) and
`upstream` (the main project, with `buddingmonkey`). You can also see your fork at
`https://github.com/yourname/medical-frailty-dashboard`.

People with write access to the main project make a branch instead of a fork. If you are one
of them, use `gh repo clone buddingmonkey/medical-frailty-dashboard`.

## Step 11. Install the project's packages

Run every command from here on **inside the project folder**. If you open a new terminal,
first type `cd ~/medical-frailty-dashboard`.

1. macOS and Linux only: make sure the right Node is in use (it reads `.nvmrc`, which says
   `26`):

   ```bash
   nvm use
   ```

2. Install the packages:

   ```text
   pnpm install
   ```

**Success:** it takes from ten seconds to a few minutes and ends with `Done in` and a time,
with no line that starts with `ERR_PNPM`.

### Secrets: you do not need any

The site runs on your computer without passwords or keys. `pnpm dev` signs you in as a local
admin (`dev@localhost`) that works only on your own computer. You do not need a Cloudflare
account. Do not create `apps/api/.dev.vars` unless a maintainer asks you to.

## Step 12. Load the local database

The site needs data. These commands fill a small database on your computer with sample data:
the real codes, 120 entries per state. Run them in this order.

1. Create the tables:

   ```text
   pnpm db:migrate:local
   ```

   If it asks whether to continue, type `y` and press Enter. **Success:** it prints a table of
   migrations, each with a check mark.
2. Load the official code lists (ICD-10-CM and HCPCS). It downloads files from CMS, so you
   need the internet. On a test run from a fresh clone it took about 75 seconds. It prints
   many `rows` lines and ends with `loaded 173935 rows` (the number may change).

   ```text
   pnpm db:ref:local
   ```

3. Load the sample state lists:

   ```text
   pnpm db:seed:local
   ```

   **Success:** the last line says `Seed loaded. Now press Rebuild coverage`. You press it in
   step 13.

Run steps 2 and 3 again whenever you want a fresh copy of the sample data. Run step 1 again
when a maintainer adds a new migration (after you update from `main`).

## Step 13. Start the site and look at it

1. Start the site:

   ```text
   pnpm dev
   ```

   It builds the site, then keeps running and printing lines. **Leave this window open.** The
   site works only while it runs.
2. Wait for a line that says `Ready on http://localhost:8787`. On a test run it appeared
   after about 30 seconds.
3. Open http://localhost:8787 in your browser. **Success:** you see the home page.
4. Finish loading the data: open http://localhost:8787/admin/unified (Admin → Unified
   categories) and click **Rebuild coverage**. Wait until it shows a result.
5. Click around: a state page, Compare, the Map.

### Stop the site

Open a **second** terminal, go to the project folder, and run:

```text
pnpm dev:stop
```

**Success:** it says `Stopped` and a number of processes (for example `Stopped 15 processes.`). The first window returns to the
prompt. Use this command rather than closing the window: it stops every part of the site.

## Step 14. Start Claude Code for the first time

1. In the project folder, type:

   ```text
   claude
   ```

2. The first time, it asks you to choose a look and to sign in. Choose your Claude account
   (subscription) or the Console (API key), and finish in the browser.
3. It asks whether you trust the files in this folder. This is the project you just cloned,
   so choose **Yes**.
4. Type a first question and press Enter:

   ```text
   Read docs/status.md and tell me in five plain sentences what this site does and where it stands.
   ```

**Success:** Claude Code answers in plain words about the site.

To leave Claude Code, type `/exit` and press Enter (or press Ctrl+D twice).

**You are set up.** Go on to [`playbook.md`](playbook.md), section 3.

## Optional: the browser tests

`pnpm check` (the check you run after every change) does not need this. The full check,
`pnpm check:full`, also runs the site in a test browser. The project's CI runs it on every
pull request, so you do not have to. To run it on your computer, install the test browser once:

```text
pnpm --filter @mfcd/web exec playwright install --with-deps chromium
```

On Linux and WSL it asks for your password (it installs system libraries).

## Optional: the Vue skill for Claude Code

`CLAUDE.md` asks Claude Code to follow the `vue-development` skill for pages. It is not part of
the repo. To add it, in Claude Code type these two commands, one at a time:

```text
/plugin marketplace add alexanderop/claude-skill-vue-development
/plugin install vue-development
```

(See `docs/architecture.md`, "Agent skills".)

## Troubleshooting

| What you see | Why | Fix |
| --- | --- | --- |
| `claude: command not found` (or `nvm`, `pnpm`, `git`; on Windows "is not recognized as the name of a cmdlet") right after installing | The terminal started before the install | Close the terminal and open a new one. For Claude Code, see https://code.claude.com/docs/en/troubleshoot-install |
| Windows: `pnpm` says "running scripts is disabled on this system" | PowerShell blocks the small script npm installed for pnpm | Do step 3, part 2 (`Set-ExecutionPolicy ...`), then open a new terminal |
| `node --version` shows something other than `v26`, or errors about `.ts` files or "Unsupported engine" | The wrong Node is in use | macOS and Linux: in the project folder, `nvm install`, `nvm use`, `nvm alias default 26`. Windows: see step 6. Remove any other Node you installed |
| `pnpm: command not found`, or `pnpm --version` is not `12.16.1` | pnpm is missing or a different version | `npm install -g pnpm@12.16.1`, then open a new terminal |
| `EACCES` or "permission denied" when you run `npm install -g` (macOS, Linux) | You are using a Node that came with the system, not nvm's | Never add `sudo`. Do step 6 again, open a new terminal, check that `which node` shows a path with `.nvm` in it |
| pnpm refuses a package because it was published too recently (`minimumReleaseAge`) | The project refuses packages less than 3 days old, which blocks most hijacked releases | Ask Claude Code to use the previous version of that package. Do not change the setting |
| `Port 8787 is still in use`, or `pnpm dev` says the address is already in use | An earlier `pnpm dev` is still running | `pnpm dev:stop`. If that does not free it, see what holds it: on Windows `netstat -ano \| findstr :8787` (the last number is the process ID; Task Manager shows it under Details), on Linux or WSL `ss -ltnp \| grep 8787`, on macOS `lsof -i :8787` |
| Pages show errors such as `no such table`, or the site has no states | The local database is empty | Do step 12 again, then press Rebuild coverage (step 13) |
| Compare or Map is empty but state pages work | Coverage was not rebuilt after seeding | Admin → Unified categories → Rebuild coverage |
| `pnpm check` says `FAIL format` | Files are not laid out the project's way | `pnpm format`, then `pnpm check` again |
| Windows: `FAIL format` on almost every file, or `\r` in an error | Git turned line endings into Windows ones (the project's `.gitattributes` should prevent this) | `git config --global core.autocrlf input`, then clone again (step 10) |
| Windows: `Filename too long` or `ENAMETOOLONG` | Windows limits path length, and the project's packages sit deep in folders | `git config --global core.longpaths true`, and keep the project in your user folder (`C:\Users\yourname\medical-frailty-dashboard`) |
| WSL: everything is very slow | The project is in a Windows folder (`/mnt/c/...`) | Clone again inside Ubuntu, into `~` (step 10) |
| `pnpm db:ref:local` fails with a network or download error | It downloads files from cms.gov | Check your internet and try again later |
| `git push` says `Permission denied`, `403`, or `GH013: Repository rule violations` | You pushed to the main project or to `main` | Push your own branch to your fork: `git push -u origin your-branch-name` |
| A check says browsers are missing (`Executable doesn't exist`) | The test browser is not installed | See "Optional: the browser tests" above |

Still stuck? Copy the exact error and ask Claude Code: "I ran `<command>` and got this error.
What does it mean and how do I fix it? Don't change anything yet." Or open an issue on GitHub.
