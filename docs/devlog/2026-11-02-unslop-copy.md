# 2026-11-02: Plain-language pass on the public pages

**Milestone:** after M5  •  **People:** project lead (asked for the pass; approved all four edits)  •  **AI:** Claude Code, Opus main session

Start 23:10 CST, end 23:20 CST (`date`).

## What happened
1. The project lead ran `/unslop cleanup` on the public pages. All visible text was gathered
   from the Vue pages, their components, the shared wording helpers and the server-rendered
   pages. The scanners found no banned phrases, and reading every sentence found four edits.
2. The project lead accepted all four:
   - The comparison intro said "grouped by the categories we compare states by". It now says
     "grouped by the same categories as the overview".
   - The comparison note had "(a code, wildcard or range each)". It's now two sentences.
   - The overview note's "whichever of" is now "no matter which of".
   - The state card's passive sentence now starts with "Our team has not yet confirmed…".
3. Left alone: "Please try again later." in 7 error messages (each one names what failed),
   the two section headings, and the "never" in "never enough alone".
4. Test first: the test expectations were changed to the new text and failed, then the text
   was changed. The three comparison and overview texts are on the legal review list, and
   that list now records the change.
