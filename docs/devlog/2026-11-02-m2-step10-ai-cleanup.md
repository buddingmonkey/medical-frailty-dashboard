# 2026-11-02: M2 step 10, AI cleanup

**Milestone:** M2 step 10  •  **People:** project lead (none needed this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 09:50 CST, end 09:58 CST (`date`).

## Goal
A way out for files the adapters cannot read: a prompt for any AI assistant, and an optional
button that asks Claude directly when an API key is set.

## What happened
1. Shared, test first: the answer schema (zod, shown to the model as JSON Schema), parts of 40
   pages, the prompt (state, file, part, rules, two worked examples, the text between
   `<source_text>` tags marked as data), and `parseAiOutput` (code fences and chatter dropped,
   zod-validated, plain-language errors, a table whose header maps itself).
2. Text for the prompt: `pageText()` turns pdf.js runs into lines; other files give 100-line
   pages. Runs in the parser worker (`textOnly`).
3. API, test first with a fake Claude client injected through `createApp`: the server builds
   the prompt, so the key only serves this task; the rate limit counts `ai.cleanup` rows in the
   audit log (no new table); a refusal or a cut-off answer is 422. Pinned `@anthropic-ai/sdk`
   1.3.0 (10 days old, no audit findings); the Worker bundle is 371 KiB gzipped.
4. `AiCleanupPanel.vue` on `/admin/ingest`: an answer becomes one more table, so mapping,
   review and drafts need no change.
5. Deliberate breaks: no fence stripping, no rate limit, the Claude button always shown; each
   failed its test.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Model default `claude-opus-5-5`, overridable by the `AI_MODEL` variable | The skill's default; the model is a cost decision for the project lead, not the AI | AI (cost choice left to the project lead) |
| Server builds the prompt | A stolen admin session cannot use the key as a general chat proxy | AI |
| Answer returned as text and validated in the browser | One validation path for pasted and API answers | AI |
| Refusal fallback on (`fallbacks: "default"`) | A declined part re-runs on Anthropic's recommended model instead of failing | AI |

## Corrections and surprises
- The cost of one large file is an estimate (about $5–6 for Nebraska on Opus 5.5); nothing was
  sent to the API. `docs/deployment.md` asks for the first real run to be measured.

## What a non-technical builder should take from this
- Build the free, manual path first; the paid button reuses it and can stay off.

## Numbers
- Tests: see `pnpm check` (shared 6, API 6, component 6 new), 1 new admin e2e (9 total).
- AI cost: not measured. Hosting: $0. Claude API: $0 (no key set).
