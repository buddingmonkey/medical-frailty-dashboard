# 2026-11-04: Launch prep (legal doc, site mark, review fixes, rebuild, copy pass)

**Milestone:** M8 (between steps; no step closed)  •  **People:** project lead  •
**AI:** Claude Code, Opus 5.5 main session (the lead) + Opus builders in worktrees, a docs
auditor, two copy-editor reviewers and one code reviewer

## Goal
Get the site ready to show people before the usability gate (M8 step 5): one document for the
legal team, a real site mark, a pre-launch code review with every finding fixed, a Rebuild
coverage that works on real data, and admin and contributor text that matches the code.

## What happened
1. The project lead asked where the lawyer questions were. They were spread over several docs.
   The lead gathered them into [`legal-review.md`](../legal-review.md) (13 decisions, then the
   public wording page by page) and a copy for Google Docs (#96, `v0.9.0` on production).
2. "Give me a nanobanana prompt to make a great favicon." The lead wrote the prompt; the
   project lead generated the mark. `scripts/make-icons.ts` redraws it as vector shapes, with
   pixel-grid lines on the 16 and 32 px sizes, and a white outline version for the header
   (#97, `v0.9.1`).
3. A docs auditor rewrote the docs in plain language and deleted the stale ones; an
   adversarial copy editor then checked facts and style (#98). Code comments now point to
   `legal-review.md`, and the design wiki was tidied (#99). Issue and PR templates (#100).
4. Rebuild coverage failed on preview with an internal error. First cause: one D1 transaction
   too big ("exceeded its CPU time limit"). Fixed by resumable steps with a cursor and
   progress, and admin errors that carry a reference (#101). Second failure: "D1 DB is
   overloaded" in a 10-second window. Fixed by weighing each step's database time, pausing
   between calls and retrying (#105). The project lead: "It worked!"
5. A code reviewer combed the codebase as a seasoned open-source maintainer would before
   going public. Builders fixed every finding, the low ones too (#102–#104): one markdown link
   check, a publish race that now returns 409, canonical cache keys, an AI cap that counts
   in-flight calls, the matching rules in one module with 44 snapshot tests of public numbers.
6. `v0.9.2` released with the rebuild and review fixes.
7. The project lead noticed the getting-started guide mentioned WSL, which the project does not
   use. Removed it and other asides (#106).
8. "The admin tool overview page also has outdated text." Same process: an auditor checked
   every admin string against the code, then a copy editor checked the auditor (#107).
9. `v0.9.3` released with the text fixes.
10. The project lead: the admin pages should not mention the preview site, which only they use
    for testing. Removed (#109) and released as `v0.9.4`.

## Decisions
| Decision | Why | Who decided |
| --- | --- | --- |
| Stay on Workers Paid | The weekly backup needs up to 160 ms of CPU; the free plan allows 10 ms | project lead (2026-11-02, confirmed) |
| Fix every review finding, low ones included | The repo goes public soon; small flaws read as carelessness | project lead |
| Guides mention only what the project uses | A newcomer can't tell an option from a requirement | project lead |
| Patch releases for text-only changes | Admin text that is wrong costs real mistakes; no reason to wait | project lead |

## Corrections and surprises
- The admin overview still said watch dates, uploads, publish and mapping were "coming next".
  All were built in M4 to M7; nobody had reread the page.
- The first admin audit itself got two facts wrong (when federal guesses count, and whether
  federal mappings block launch). The second reviewer, told to check claims against code,
  caught both. One reviewer is not enough for factual text.
- The lead suspected a builder had dropped a planned move to the free plan. The project lead had
  already decided to stay on Paid; the memory was stale.
- The rebuild failed twice for two different D1 limits. Measuring rows read per step on preview
  (read-only) turned guessing into numbers.
- A literal `<img src>` broke only the Windows tests; the Windows CI job caught it.

## What a non-technical builder should take from this
1. Reread your own help text after each milestone. Screens change faster than their words.
2. For anything that states facts, ask a second reviewer to check each claim against the
   source, and say "check against the code", not "review the wording".
3. When something fails twice, the second error is often a different problem. Read it fresh.

## Numbers
- Time: ≈ 13 h of wall clock across the day (11:04 to 00:23 CST merges), with long idle gaps;
  active time not measured.
- 14 PRs (#96–#109); 4 releases (`v0.9.1` to `v0.9.4`).
- 1,806 Vitest (727 unit, 30 reference data, 328 component, 621 API, 100 scripts) and 271 e2e.
- AI cost and hosting: not measured; Workers Paid.

## Open threads
- Press Rebuild coverage once on production after `v0.9.3`.
- GA source URLs and dates on production; M8 step 5 (usability) and step 8 (go live).
- Restore drill; Web Analytics token; whether `check (windows)` becomes required.
- Run getting-started on a fresh machine; a code of conduct (not yet requested).
