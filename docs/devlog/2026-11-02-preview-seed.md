# 2026-11-02: Seed data for preview and local development

**Milestone:** after M5 (preview data, step 3)  •  **People:** project lead (chose "a sample of real lists")  •  **AI:** Claude Code, Opus main session

Start 22:44 CST, end 22:55 CST (`date`).

## What happened
1. `pnpm db:seed:make` (`scripts/make-seed.ts`) writes `apps/api/seed/seed.sql`. The file is
   committed and about 300 KB: 120 real entries per state with their sources and mappings,
   and the 19 starter categories published. Admin identities become `seed@localhost`, and the
   generator stops if any other email address is left. There's no reference data.
2. `pnpm db:seed:local` and `pnpm db:seed:preview` (`scripts/seed.ts`) delete the state data in
   that database and load the seed. They refuse any other target, however it's spelled. Then
   **Rebuild coverage** (step 2) fills in the derived tables.
3. The rehearsal ran on a copy of the local dev database (with reference codes and CCSR). It
   loaded the seed, ran the real Worker, called the rebuild and read the public pages. It found
   three problems:
   - `states.updated_at` is NOT NULL, so the reset may not clear it. The failed load rolled
     back whole.
   - The local unified category ids start at 16, so a mapping copied by id broke a foreign key.
     Mappings now find their category by slug.
   - The first sampler took codes in code order. Every list became chapter A infections, which
     none of the starter categories cover: 118 of 480 entries were placed, and Nebraska showed
     in no category. The sampler now puts codes in a unified category first and spreads picks
     over the code range (a van der Corput order). After the change, 368 entries were placed,
     and each state had entries in 11 to 17 of the 19 categories. Every pair shares codes.
4. GA's 16 unified mappings (all proposed) stay proposed. Approving them would place GA's
   codes in all 16 categories, and keeping them proposed means preview still tests the
   approval flow.
5. Scripts now import `./x.ts`, because Node runs them directly. The root tsconfig allows it.

## Open threads
- On preview: run `pnpm db:seed:preview` after the production copy is checked, then press
  Rebuild coverage. That button needs the project lead, since preview admin is behind Access.

## Outcome (23:08 CST)
The project lead approved the copy, and production matched preview: counts, checksums, states,
and the SHA-256 of all five R2 files. `pnpm db:seed:preview` then replaced preview's lists
with the seed, which holds 480 entries and 19 published categories. Both D1 bookmarks are in
`docs/status.md`.
