# Status

_Last updated: 2026-11-13. M0–M7 done. M8 steps 1–4, 6 and 7 (except the restore drill) done; steps 5 (usability gate)
and 8 (go live) wait for the project lead. Production runs `v0.9.5` (ui-sdk tooltips and
hover cards, the Overlaps tab, the new state picker, 2026-11-13)._

The devlog (`docs/devlog/`) records how each step was built. This file keeps what is true now,
what is still open, and the decisions behind it.

## Where things stand

- **Production** holds the real lists for the four seed states (GA, LA, MT, NE), copied from
  preview on 2026-11-02, and admins edit them there. **Indiana** (Tier 1 only, 4,250 ICD-10-CM
  codes) was added on production by the project lead on 2026-11-13 (`docs/sources.md`,
  Indiana). The whole site stays behind Cloudflare Access (the pre-launch gate) until go-live.
- **Preview** is a test site with seed data and a gold "Preview site: test data" banner: 4 real
  states (up to 300 real entries each), 40 synthetic lists, 4 announced and 3 with no list
  (`apps/api/seed/seed.sql`, written by `pnpm db:seed:make`). Never seed production.
- **Built:** the public site (map, `/states`, state pages, compare tabs including Overlaps, code search, code
  pages, About, Disclaimer, Privacy, Accessibility; server-rendered HTML, JSON-LD, sitemap
  index, `/llms.txt`), and the admin area (upload, read and map, review, drafts and checks,
  publish and rollback, federal and unified category mapping, condition groups, backup and
  restore, weekly maintenance, launch readiness, watch dates, audit log).
- **Toolchain:** Node 26 LTS, pnpm 12.16.1 (installed by hand), TypeScript 6.0.3, not 7
  (`docs/architecture.md`, "Tool versions"). pnpm refuses packages younger than 3 days. All
  scripts are cross-platform Node, with a `check (windows)` CI job.
- **ui-sdk** (`@ui-sdk/vue`, `@ui-sdk/core` 0.1.0-beta.1, added 2026-11-12) gives the badge
  tooltips, the matrix hover cards and the Overlaps rows. Its theme CSS is not loaded; see
  `AGENTS.md`. **Temporary:** `pnpm-workspace.yaml` exempts the two packages from the 3-day
  rule (project lead, 2026-11-12). Remove that entry after 2026-11-15.
- **Skill folders** (`.agents/`, `.claude/skills/`, `skills-lock.json`) stay untracked on
  purpose (user, 2026-11-01). Their sources are in `docs/architecture.md`, "Agent skills".

### Milestones

| Milestone | Done | PRs | Devlog |
| --- | --- | --- | --- |
| M0 Scaffolding | 2026-11-01 | up to #10 | `2026-11-01-m0-step*.md` |
| M1 Data foundation | 2026-11-01 | 7 PRs | `2026-11-01-m1-milestone.md` |
| M2 Ingestion (admin) | 2026-11-02 | #20–#33 | `2026-11-02-m2-step12-and-milestone.md` |
| M3 Home page | 2026-11-02 | #37–#40 | `2026-11-02-m3-milestone.md` |
| M4 Compare by category | 2026-11-02 | #42–#44 | `2026-11-02-m4-milestone.md` |
| M5 Compare across many states | 2026-11-02 | #47–#56 | `2026-11-02-m5-milestone.md`, `2026-11-02-m5-review.md` |
| Preview data (real lists to production, seed on preview) | 2026-11-02 | | `2026-11-02-preview-copy.md`, `2026-11-02-preview-seed.md` |
| M6 Code search | 2026-11-03 | #69–#76 | `2026-11-03-m6-code-search.md` |
| M7 Admin completion | 2026-11-03 | #80–#82 | `2026-11-03-m7-admin.md` |
| M8 steps 1–4, 6, 7 | 2026-11-03 | #85–#94 | `2026-11-03-m8-hardening.md` |

### Releases

Production deploys come from CI on a `v*` tag, after the project lead approves. Before
migrating, the deploy workflow (`.github/workflows/deploy.yml`, step "Record D1 Time Travel
bookmark") writes a D1 Time Travel bookmark and its restore command to that run's GitHub Actions
summary; the copy-state-data workflow does the same for its copy. Look there for a restore point
(Time Travel keeps 7 days). This table records only what shipped.

| Tag | Date | Notes |
| --- | --- | --- |
| `v0.0.1` | 2026-11-01 | First deploy, both Workers behind Access |
| `v0.1.0` | 2026-11-01 | Schema and FTS; reference load (22 chunks, 107,173 rows) |
| `v0.2.0` | 2026-11-02 | Migrations 0002–0006 |
| `v0.3.0` | 2026-11-02 | Release |
| `v0.4.0` | 2026-11-02 | Compare by category |
| `v0.5.0` | 2026-11-02 | M5; production then needed the CCSR load |
| Copy state data | 2026-11-02 | Preview's four states copied to production; row counts, checksums and R2 SHA-256 match |
| `v0.6.0` | 2026-11-03 | Compare tabs |
| `v0.7.0` | 2026-11-03 | Migrations 0012–0014 (search index built in 0.9 s) |
| `v0.8.0` | 2026-11-03 | Migration 0015, Sunday cron on |
| `v0.9.0` | 2026-11-04 | M8 hardening |
| `v0.9.1` | 2026-11-04 | New site mark |
| `v0.9.2` | 2026-11-04 | Paced, resumable Rebuild coverage; pre-launch review fixes |
| `v0.9.3` | 2026-11-05 | Admin and getting-started text corrected |
| `v0.9.4` | 2026-11-05 | Admin pages no longer mention the preview site |
| `v0.9.5` | 2026-11-13 | Badge tooltips, matrix and map hover cards, Overlaps tab, state picker, Zod jitless (live) |

## For the project lead

Open items, with the date each was raised. Close them here when done.

- **M8 step 5, usability gate:** invite 3–5 target users and run the task script
  (`docs/roadmap.md`, M8).
- **M8 step 8, go live:** domain or a host organization, then `docs/deployment.md`, "Going
  live".
- **Restore drill** on preview, together (M8 step 7, 2026-11-03).
- **Indiana on production** (2026-11-13): map its 159 categories on `/admin/categories` and
  `/admin/mappings`. 2,319 entries are "Not yet classified" because the guess works from
  names. After the release with the state's own federal category column and suggestions by code
  (project lead, 2026-11-13), re-upload Indiana's CSV with the federal column mapped and publish
  it, then press **Re-run automatic suggestions** on `/admin/categories` for GA, LA, MT and NE,
  and review their suggestions. The state page will not mention Indiana's Tier 2, which has no
  published codes (project lead, 2026-11-13).
- **Georgia sources on production:** set the URL (DCH public notices page) and publisher date
  (2026-07-09) on GA's two source documents in `/admin/sources` (2026-11-03).
- **Publish on production:** the 19 starter comparison categories and the 8 condition groups
  are still drafts. Check the groups' CPT ranges first: they are numbers only and unchecked
  (2026-11-03).
- **Web Analytics:** register it and set `CF_BEACON_TOKEN` per environment
  (`docs/deployment.md`, "Web Analytics"; 2026-11-03).
- **Decide** whether `check (windows)` is a required check (2026-11-03).
- **Map contrast:** the "no list" fill is 1.23:1 (light) and 1.53:1 (dark) against the page;
  proposed outline #848f9e / #6b7f9e (2026-11-03).
- **SEO:** run the Rich Results Test and the bot-settings checklist (`docs/seo.md`).
- **Other machines:** add `D1_PREVIEW_DATABASE_ID` to their `apps/api/.env.cloudflare`.
- **Run getting-started.md on a fresh machine:** steps 5, 8 and 14 (GitHub, Claude Code
  sign-in) were never run; the Windows CI job covers only the scripts (2026-11-03).
- **Try "Run maintenance now"** on preview (Backup and restore page; 2026-11-03).
- **Watch dates:** close the 2026-11-30 Workers downgrade item in `/admin/watch`; the project
  lead stays on Workers Paid.
- **Legal review:** every provisional wording item and rule is in
  [`docs/legal-review.md`](legal-review.md). Add new items there.

## Known limits

- The Cache API does nothing on `*.workers.dev`, so the shared cache starts working only on a
  custom domain. Until then each public request reads D1; one sitemap request reads about 44k
  rows.
- A remap of a large state costs about 8k D1 writes. A new CCSR or ICD-10-CM release needs
  **Rebuild coverage** pressed by hand.
- `entries_fts` (the states' own text) has no stemming, unlike `ref_codes_fts`. The project lead
  chose to leave it (2026-11-03); it is on the legal list.
- The weekly dump uses 65–160 ms CPU, so it needs Workers Paid (`docs/deployment.md`, "Weekly
  maintenance").
- The real Claude API call in "Ask Claude" is untested; tests use a fake. The button stays off
  until `ANTHROPIC_API_KEY` is set (about $5–6 for Nebraska's whole file on Opus 5.5).
- GA-B page 60 has a row with no code (`docs/sources.md`).

## Decisions

| Topic | Decision |
| --- | --- |
| Hosting | Cloudflare: one Worker serves the Vue build (static assets) and the API; D1 for data; R2 for source files and backups |
| Parsing | In the admin's browser (pdf.js, read-excel-file). The server receives validated JSON rows only |
| AI cleanup | Both: a copy-paste prompt (free, always available) and an optional Claude API button that works only when an API key secret is set. The button stays off, shown disabled with a tooltip that says it needs a key and costs money (project lead, 2026-11-02) |
| Admin auth | Cloudflare Access with Google login, plus JWT verification in the Worker |
| Pre-launch | The **whole site** is behind Access until the user marks it live. After launch, only `/admin*` and `/api/admin*` stay protected |
| Site gate | Before launch, anyone Access lets in may see the site (admins, guest testers, CI service token); admin routes also need `ADMIN_EMAILS` (user, 2026-11-01) |
| Launch criteria | At least **2 states** with every category mapping confirmed by an admin, plus a usability gate: real target users can complete the core tasks (roadmap M8) |
| CPT text | Show the state's published description with a citation, and an AMA notice in the footer. No CPT descriptor table of our own |
| Repo | Public on GitHub (free Actions minutes, CodeQL) |
| Branch protection | Ruleset on `main` with no bypass, not even for admins (user, 2026-11-01) |
| Domain and hosting | Use `*.workers.dev` for now. In M8 the project lead buys a domain (~$10/yr via Cloudflare Registrar) or gives the site to an organization to host. Keep the site portable (user, 2026-11-01) |
| Workers plan | Workers Paid ($5/month). First bought for one month so the 107k reference rows load in one go (2026-11-01); kept on 2026-11-02, so the 2026-11-30 downgrade is dropped and the Free plan's 10 ms CPU limit no longer applies |
| Seed states | Georgia (Attachments A and B), Louisiana, Montana, Nebraska |
| States only | The 50 states and DC; no territories (project lead, 2026-11-01) |
| Name | **Medical Frailty Coding Dashboard** |
| Licence | MIT (`LICENSE`) |
| Admins | Two Google accounts. The emails live only in the Access policy and the `ADMIN_EMAILS` Worker secret, **never in the public repo** |
| Georgia A/B | Two tiers, loaded as one version; tier kept in `entries.tier` |
| Tiers and qualification | Show **each state's own rule**: the state's tier label plus a badge (qualifies alone / needs another code / supporting evidence / state doesn't say), with "inferred" where we deduced it. Site-wide note on the 2026-10-29 *Massachusetts v. Oz* ruling. Compare and search can filter to "qualifies alone" (user, 2026-11-01, after research showed the ruling does not strike down tiers). **Provisional:** the lawyers may ask to remove or reword the badges |
| Step 11 assumptions | Bare 3-character codes read as whole categories; GA A = qualifies alone, GA B = needs another code (both stated); MT Tier 1 = qualifies alone, Tier 2 = state doesn't say; NE = state doesn't say; LA designation 0/1/2 inferred (`docs/sources.md`). The project lead says these look right and will verify later (2026-11-02) |
| Look and feel | Colours based on the Georgetown CCF palette; open-licensed fonts (Jost headings, Source Sans 3 body, IBM Plex Mono codes), self-hosted; no serif for now. **Not an official CCF site**: no CCF name or logo; branding may be added later (user, 2026-11-01) |
| Dark mode | Light, dark and "follow system" must all work; axe runs in both themes (user, 2026-11-01) |
| Theme menu | Dropdown with icons in the header (System / Light / Dark) (user, 2026-11-01) |
| Static files and the Worker | Until launch every request runs the Worker first (one place for headers; the site gate covers assets). At go-live, `/assets/*` moves to direct serving with a `_headers` file (user, 2026-11-01) |
| CSP styles | No `'unsafe-inline'` for `style-src` (user, 2026-11-01) |
| Logs | Workers Logs + Traces on, query strings redacted (user, 2026-11-01) |
| robots.txt | Private: disallow all. Public: allow the site, disallow `/admin` and `/api/`; add a sitemap at launch (user, 2026-11-01) |
| SEO and GEO | Best practices; AI crawlers welcome so AI gets the right information. The Worker renders real HTML for public pages. `Content-Signal: search=yes, ai-input=yes, ai-train=yes` (`docs/seo.md`; user, 2026-11-01). **`ai-train=yes` is provisional:** pages quote AMA-copyrighted CPT text |
| D1 backups before production migrations | D1 Time Travel bookmark logged by CI, not `wrangler d1 export`, which refuses FTS5 databases (user, 2026-11-01) |
| IDs and dates | Integer IDs (states keep the 2-letter code); ISO-8601 text dates (user, 2026-11-01) |
| State page URLs | Lowercase postal code, `/states/ga`; the database enforces `slug = lower(id)` (user, 2026-11-01) |
| Code page URLs | Computed from code system + code, e.g. `/codes/icd-10-cm/F20.0`; no slug column (user, 2026-11-01) |
| Excel reader | `read-excel-file` from npm, not SheetJS from its CDN (project lead, 2026-11-01) |
| Add-a-state guide | Served in the app at `/admin/guide` (rendered from `docs/add-state-source.md`), linked from "Read and map" when a file cannot be read. No separate agent skill (project lead, 2026-11-02) |
| Three category levels (M5) | Federal, unified (admin-curated; "comparison categories" on public pages) and state-specific; all five mockup views; M5 before code search (project lead, 2026-11-02; `docs/devlog/2026-11-02-m5-plan.md`) |
| Federal category (M5) | A code's federal category follows its unified categories' fixed federal parents (a code in two counts under both); admins manage only state → unified; the M2 federal mapping is the fallback (project lead, 2026-11-02) |
| CCSR (M5) | Used from the start; downloaded from AHRQ at load time, pinned by version and SHA-256, never committed (AHRQ states no licence) (project lead, 2026-11-02) |
| Mapping approval (M5) | One admin may approve; public pages say who reviewed it and when (project lead, 2026-11-02) |
| Retiring drafts | A never-published unified category may be retired (project lead, 2026-11-02) |
| Reference releases | A new CCSR or ICD-10-CM release rebuilds universes and placements (project lead, 2026-11-02) |
| Two comparison rules | "State doesn't say" is not a disagreement between states; a chapter override counts as confirmed. Kept as built, on the legal list (M5 review, 2026-11-02) |
| "No list" shade | Neutral grey in both themes (M5 review, 2026-11-02) |
| Production data | Production holds the real lists and admins edit them there; preview holds seed data and a banner (project lead, 2026-11-02) |
| Backups | The manual download leaves out R2 keys; the weekly dump keeps them; 50 MB import cap; a restored mapping keeps its original mapper and the audit row names who restored it (lead, M7, 2026-11-03). The download is a zip (project lead, 2026-11-03) |
| Professional site basics | Favicon and icons, share image, footer links, privacy and accessibility statements, `security.txt`, print styles (project lead, 2026-11-02; built in M8 step 4) |
| `pnpm dev:stop` | Stops the whole `pnpm dev` tree, parents first (project lead, 2026-11-01) |

## Open questions

1. **Dates to watch** live in the app at `/admin/watch`. Next: ~2026-12-28, the
   *Massachusetts v. Oz* appeal deadline.
2. **Louisiana "Code Designation" (0/1/2):** likely 0 = qualifies alone, 1 = needs a
   supporting code, 2 = supporting evidence only (SHVS 2026-09-11 and a fit against the data).
   LDH has not confirmed it, so the site shows it as "inferred". The "code system" explanation
   does not fit the data. See `docs/sources.md`.
3. **Louisiana .xlsx:** none public (search, 2026-11-01). LDH's work requirements page
   (https://ldh.la.gov/Medicaid/work-requirements) links only PDFs, none of them the code list;
   the source URL of our `HR1-Codes` PDF is unknown. Next step if wanted: ask LDH or an MCO
   provider-relations line for the .xlsx and the Code Designation definition. Until then, parse
   the PDF.
4. **Georgia:** the source was found on 2026-11-03 (DCH public notices page, posted 2026-07-09;
   `docs/sources.md`). Watch for a list with the 2026-08 HIV additions.

## Watch dates

**History only.** Migration `0002_seed_watch_items` copied this table into `/admin/watch` on
2026-11-01; add, edit and close dates there, not here. Approximate dates are marked ~.

| Date | What | Why it matters | Source |
| --- | --- | --- | --- |
| ~2026-12-28 | *Massachusetts v. Oz*: CMS appeal deadline (60 days from judgment; exact date depends on when judgment was entered) | An appeal or stay may change the site's ruling note; states may loosen combination rules either way | `docs/sources.md`, "Federal and court rulings" |
| 2026-11-30 | Downgrade the Cloudflare account from Workers Paid to Free (dropped 2026-11-02) | The $5 was for one month only (reference-code load) | Decisions table |
| ~2026-12 | CMS posts the January 2027 HCPCS file | Build the diff loader first, so the update loads only new and changed codes (`packages/reference-data/README.md`, "Updating") | CMS HCPCS quarterly update page |
| ~2027-06 | CMS posts ICD-10-CM FY2028 files (valid 2027-10-01) | Load the changes into `ref_codes`; re-run checks for every state | CMS ICD-10 page |
| 2027-01-01 | Work requirements take effect | States may publish final or revised lists before this date; re-check all seed states | H.R.1 §71119 |
| ~2027-04-29 | End of the 6-month enforcement stay for the 26 plaintiff states (6 months from 2026-10-29; confirm against the order) | Plaintiff states' frailty processes may change | Opinion, "Relief" |
| No date | *Taylor v. Kennedy* (D. Md. 1:26-cv-03705) pending | A ruling could change the federal rules again | `docs/sources.md` |
| No date | LDH confirms Louisiana "Code Designation" meaning | Remove the "inferred" label, or fix the mapping | `docs/sources.md`, Louisiana |
| No date | Legal team decides the licence of the compiled lists (for the `license` field in the `Dataset` JSON-LD and the downloads; left out until then) | Search engines recommend a licence on datasets | `docs/seo.md` |
| No date | Legal team reviews the provisional wording and rules ([`docs/legal-review.md`](legal-review.md)) | Badges may be removed or reworded; AI training signal may change | Decisions table; `docs/seo.md` |

## How the user likes to work

- **Within a milestone, keep going** (user, 2026-11-01): show the plan briefly, then build
  without waiting for approval, merge each step's PR when CI is green, and move to the next
  step. Ask questions only when blocked on a product or legal decision. **The hard gate is the
  end of a milestone:** stop there for the project lead's review. Production tags still need
  explicit approval.
- The user works with a team of lawyers. On legal questions (what the ruling means, how
  qualification is described, disclaimers, CPT text) the lawyers decide. Present research and
  a recommendation, label it as not legal advice, and expect changes.
- Re-ingestion must be safe (user, 2026-11-01): a re-upload can replace a whole state, behind
  drafts, blocking and typed-confirm checks, a diff, an atomic per-state publish, a pre-publish
  backup and one-click rollback (`docs/ingestion.md`, "Checks before publishing";
  `docs/data-model.md`, "Replacing a state's list").
- Keep `CLAUDE.md` small. It points to docs that agents load when they need them.
- The user pays for hosting personally, so keep running costs near $0. Say what anything
  will cost before adding it.
- Ask questions instead of guessing on product decisions.
