# 2026-11-02: after the M2 review

**Milestone:** M2 follow-ups  •  **People:** project lead  •  **AI:** Claude Code, Opus main session

Start 11:24 CST, end 11:28 CST (`date`).

## Goal
Act on the project lead's answers to the M2 questions.

## What happened
1. The add-a-state guide is served in the app: `/admin/guide` renders `docs/add-state-source.md`
   (one copy) with a small Markdown reader that produces text nodes only (no `v-html`; script
   links become text). "Read and map" links to it when a file cannot be read.
2. The "Ask Claude" button is always shown; with no key it is `aria-disabled` with a tooltip.
3. The step 11 assumptions stand; the project lead verifies them later.
4. Release `v0.2.0` to production after this merges (the project lead approves the deploy).
5. Found while editing: a bold marker in `docs/ingestion.md` lost its closing `**` in step 10.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Guide in the app, not an agent skill | The person who needs it is the admin whose file just failed | project lead |
| Render the doc, not a copy of it | One source; the doc also serves AI assistants | AI |
| `aria-disabled` instead of `disabled` | A disabled button cannot take focus, so keyboard users would never see the tooltip | AI |

## Numbers
- Tests: 4 new Vitest (Markdown reader 3, guide page 1), the tooltip test rewritten, e2e updated.
