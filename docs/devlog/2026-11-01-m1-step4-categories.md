# 2026-11-01: M1 step 4, federal categories and auto-mapping

**Milestone:** M1 step 4  •  **People:** project lead (not involved in this step)  •
**AI:** Claude Code, Opus main session (no builder agent)

Start 21:45 CST, end 21:49 CST (commit times; an earlier draft of this entry had guessed times).

## Goal
The federal categories, with the statute's wording confirmed and cited, and the keyword
table that suggests a federal category for each state category.

## What happened
1. The AI looked for the enacted statute. congress.gov refused the request (HTTP 403) and the
   U.S. Code site returned 404; the enrolled law on govinfo had the text. The medically frail
   exclusion is Social Security Act §1902(xx)(9)(A)(ii)(V), clauses (aa)–(ee).
2. Our five categories match the law. Two wording details differed from our docs: (ee) is
   singular ("a serious or complex medical condition"), and (dd) says "their ability to
   perform 1 or more activities of daily living".
3. Tests first: one row per LA and MT category as published, plus statute wording. Red, then
   green (28 tests).
4. **The documented keyword table had a bug:** the keyword `disab` would map LA "Temporary
   disabling" to *blind or disabled*, while the data model says it is state-specific. The new
   table puts state-specific phrases first and matches only whole words or word starts.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Statute text and clause numbers stored with each category | Pages can quote the law exactly; the lawyers can check one file | AI |
| Keyword priority order, lower confidence on disagreement | Ambiguous labels still get a suggestion, but the admin sees it is weak | AI |
| No keyword mapping for chapter-only states (NE, GA) | An ICD chapter heading is not a frailty category; those states use an admin-set default | AI, following `docs/ingestion.md` |
| Category labels are provisional | Public wording of legal categories is the legal team's call | Standing rule (`docs/status.md`) |

## Corrections and surprises
- `disab` in the planning docs would have mis-mapped a Louisiana category. A test row per
  real category caught it before any data existed.
- Two of three official sources for the law were unreachable by the AI's tools. The one that
  worked is the authoritative copy (the Government Publishing Office).

## What a non-technical builder should take from this
- Quote the law from the official publication, and keep the quote next to the code that
  relies on it. Then a lawyer can check one file.

## Numbers
- Time: about 4 minutes.
- AI cost: not measured. Hosting: $0.
- Tests: 28 new (176 unit total); all passing.

## Open threads
- Legal review of the category labels.
- M1 step 5: diff and checks engine.
