# Talk and blog notes

Working notes for a future blog post or conference talk: **how a non-technical organization
can build a useful public tool with an AI coding assistant, safely and for almost no money.**
Add to this file whenever a devlog entry has something worth telling.

## Working title options

- "From PDFs to policy comparison: building a public Medicaid tool with an AI pair"
- "No developers, no budget: what it actually takes to build a civic data site with AI"

## Audience

Non-profit and advocacy staff, state agency staff, small policy shops. Some technical
literacy, little or no coding.

## Story arc (draft)

1. **The problem.** H.R.1 work requirements; states publish medically frail code lists in
   incompatible formats (PDF printouts of spreadsheets, 295-page indexes). Nobody can
   compare them.
2. **The bet.** Could a non-developer build the comparison tool with an AI assistant, keep it
   secure, and run it for about $0?
3. **Planning before code.** The AI read real files first, asked questions, and wrote the
   plan into docs that future sessions read.
4. **Where humans and AI were each wrong** (the strongest section). See "Moments" below.
5. **Guardrails that let a non-developer stay safe:** private until launch, checks before
   publishing data, rollback, tests, CI-only production deploys.
6. **Real users decide when it's ready.** The usability gate.
7. **Numbers.** Time, money, size.
8. **The playbook.** How the audience can do this (`docs/playbook.md`).

## Moments (with devlog links)

| Date | Moment | Lesson | Devlog |
| --- | --- | --- | --- |
| 2026-11-01 | Profiling the real PDFs found code formats the spec never mentioned | Give the AI real data early | `devlog/2026-11-01-planning.md` |
| 2026-11-01 | A pasted explanation of Louisiana's "Code Designation" contradicted the data; the AI caught it | Verify claims against data, whoever made them | same |
| 2026-11-01 | The project lead's reading of a court ruling was only partly right; a research agent found the opinion, and the main session double-checked the agent | Ask for primary sources; check the checker | same |
| 2026-11-01 | Mid-stream requirements (stay private until launch; safe full-state replacement) folded into the design | You can steer while it works | same |
| 2026-11-01 | Lawyers keep the final word on legal wording; the design makes badges switchable without code changes | Build for decisions you know will change | same |
| 2026-11-01 | The 3-day package-age guard refused two brand-new releases on its first install, and strict lint flagged the AI's own deprecated config | Safety rules catch real things on day one; check versions online, not from memory | `devlog/2026-11-01-m0-step1-workspace.md` |
| 2026-11-01 | The project lead asked for a palette "based on" a real organization's site. The AI pulled the colours from that site's stylesheet, but found its fonts are licensed to that organization only and picked free look-alikes | "Use their branding" has a legal edge: colours are fine as inspiration, licensed fonts and logos are not | `devlog/2026-11-01-m0-step2-web.md` |
| 2026-11-01 | Two docs disagreed: "static files skip the Worker" and "the Worker adds security headers to every response" cannot both be true. Found while planning, before any code | Ask the AI to list what in the plan looks wrong before it builds; contradictions are cheap to fix on paper | `devlog/2026-11-01-m0-step3-api.md` |

## Numbers to collect

Start in M0; record per milestone in the devlog and total them here.

| Measure | How to get it |
| --- | --- |
| Hours of human time | Note start and end of each session |
| AI usage cost | Claude usage page / Console, per milestone |
| Hosting cost | Cloudflare billing page, monthly |
| Lines of code and of docs | `git diff --stat` per milestone |
| Tests and pass rate | `pnpm check` summary |
| States loaded, codes compared | Admin launch-readiness page |
| Usability results | `docs/usability.md` (M7) |
| Times the AI was wrong / a human was wrong, and how caught | Devlog "Corrections and surprises" |

## Running totals

| Milestone | Human hours | AI cost | Hosting | Notes |
| --- | --- | --- | --- | --- |
| Planning (2026-11-01) | not measured | not measured | $0 | Plan docs only |
| M0 step 1 (2026-11-01) | 0.1 (6 min) | not measured | $0 | Workspace, lint, typecheck |
| M0 step 2 (2026-11-01) | 0.2 (13 min) | not measured | $0 | Vue app, design tokens, light + dark |
| M0 step 3 (2026-11-01) | 0.4 (21 min) | not measured | $0 | Hono Worker, headers, strict CSP |

## Assets to capture for slides

- Screenshot of a raw state PDF next to the same codes in the compare view.
- The checks screen stopping a wrong file.
- Before/after of the home map as states get added.
- A short screen recording of loading a state end to end.
