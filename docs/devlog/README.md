# Development log

A dated record of how this site was built: what we asked for, what the AI did, what went
wrong, and what we decided. It has three uses:

1. **Memory** for future sessions and contributors (why things are the way they are).
2. **Raw material for the playbook** (`docs/playbook.md`): steps that worked get promoted there.
3. **Raw material for a blog post or conference talk** (`docs/talk-notes.md`).

## When to write an entry

- At the end of every working session that changed the plan or the code.
- At the end of every roadmap milestone (M0, M1, ...), even if a session entry exists.
- Whenever something surprising happens (the AI was wrong, a cost appeared, a state changed
  its list). A short entry is better than none.

## File name

`docs/devlog/YYYY-MM-DD-<topic>.md`, one file per session. Several sessions on one day get
separate files.

## Template

```markdown
# YYYY-MM-DD: <topic>

**Milestone:** M? step ?  •  **People:** <roles, e.g. "project lead", "legal team">  •
**AI:** <tools and models, e.g. Claude Code, Opus main session + Sonnet search agent>

## Goal
What we set out to do, in one or two sentences.

## What happened
Short numbered list in order. Include the user's key requests (paraphrase or quote) and what
the AI did in response.

## Decisions
| Decision | Why | Who decided |

## Corrections and surprises
Where the AI or a human was wrong and how it was caught. These are the most valuable notes
for the talk; record them plainly, without blame.

## What a non-technical builder should take from this
1–3 lessons, written for someone who has never coded. Promote good ones to the playbook.

## Numbers
Time spent (rough), money spent (hosting, AI usage), lines of code/docs changed, tests added.
Write "not measured" rather than guessing.

## Open threads
What is left for next time.
```

## Rules

- The repo is **public**. No email addresses, phone numbers or names of people who have not
  agreed to be named. Use roles ("project lead", "a lawyer on the team").
- No secrets, no API keys, no Cloudflare account IDs.
- Facts only. If a number was not measured, say so.
- Keep each entry under ~150 lines. Link to docs and commits instead of copying them.
