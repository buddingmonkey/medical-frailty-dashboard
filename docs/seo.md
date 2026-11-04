# SEO and GEO

Goal (project lead, 2026-11-01): **best SEO and GEO practices. We want AI to crawl the site
to get the right information.** GEO (generative engine optimization) means making pages easy
for AI assistants and AI search to read, quote correctly and cite.

The audience asks questions like "Does Louisiana count F20.0 as medically frail?" or "Which
states list multiple sclerosis?". Every such answer should come from a page here, with the
state's source cited.

## Decisions

| Topic | Decision |
| --- | --- |
| Crawlers | All crawlers welcome on public pages, AI crawlers included. Admin pages and `/api/` are disallowed (`apps/api/src/routes/robots.ts`) |
| Content signals | `Content-Signal: search=yes, ai-input=yes, ai-train=yes` (project lead, 2026-11-01). **Provisional:** pages quote states' CPT descriptions, which are AMA-copyrighted, so the legal team may ask to change `ai-train` (`docs/legal-review.md`, item 8) |
| Rendering | The Worker sends real HTML for every public page (below). Vue takes over in the browser |
| Domain | Bought in M8, or the site is given to an organization that hosts it on its own domain. Either way, nothing may hard-code the `workers.dev` host |

## Requirements

### 1. Server-rendered HTML for public pages (M3–M6)

Most AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) do not run JavaScript, so a
client-only Vue page looks empty to them. Googlebot runs JavaScript, but late and unreliably at
scale. So for every public route the Worker:

- Starts from the built `index.html` and, using `HTMLRewriter`, fills in the `<title>`, meta
  description, `<link rel="canonical">`, Open Graph tags, JSON-LD, and **the page's actual
  content as semantic HTML** (headings, a summary, the code table, sources) inside `#app`.
- Vue mounts over it as usual; no hydration is needed. The server HTML and the Vue page must
  show the same facts. An E2E test fetches each page type with JavaScript disabled and checks
  the key facts are present.
- Caches the rendered HTML in the Workers Cache API keyed on `data_version`, so crawler traffic
  rarely reaches D1. While `SITE_MODE` is private nothing is cached (`docs/architecture.md`,
  "Caching").

**Built in M3 step 4** for `/` and `/states/:slug` (`apps/api/src/seo/`, `routes/pages.ts`):
the content is plain HTML from the same shared wording and formatting helpers as the Vue
pages; every value from the database is escaped (`seo/html.ts`), and JSON-LD escapes `<`, `>`
and `&`. `/states/GA` answers 301 to `/states/ga`; an unknown state answers 404 with
`noindex`. Code pages follow in M6. `e2e/no-js.spec.ts` reads a state page with JavaScript
off.

**Built in M4 step 2** for the code table, at `/compare/codes?…` since M5 step 5: always
`noindex`, canonical to the bare `/compare/codes`; the HTML carries the table for the selection
in the URL (one page of 100 rows) and a link to `/compare/codes.csv?…` (every row). Without a
selection it explains the page; a bad link says so. `e2e/compare.spec.ts` reads it with
JavaScript off. Old links (`/compare?states=…`, `/compare.csv?…`) answer 301 with the same query.

**Built in M5 step 5** for `/compare`, the overview matrix: indexed, canonical `/compare`, in the
sitemap; the HTML carries the whole matrix (every state, every published unified category, the
same numbers and words as the Vue page from `packages/shared/src/overview.ts`) and the
"Reading this table" notes. `e2e/overview.spec.ts` reads it with JavaScript off. Since M5 step
5b the order is in the URL (`?order=similar|overall`, `?sort=<category slug>`, `&dir=asc`;
defaults left out), so a shared link keeps it; the HTML rows follow it and the sorted column
carries `aria-sort`. The canonical stays the bare `/compare`.

**Built in M5 step 6** for `/compare/<slug>`, the category drill-down of each **published**
unified category: title "<label> codes by state | …", description from the category's
definition (cut at 300 characters), canonical the bare `/compare/<slug>`. The bare page is
indexed and in the sitemap; **any query** (`show`, `system`, `all`, `focus`, `page`, `code`)
is a view of it and says `noindex` (the canonical stays bare). The HTML carries the category,
its CCSR groups with AHRQ's citation, a GET form for the filters (works without JavaScript),
one page of groups as a real table with every group expanded (a `tbody` per group, its header
`th scope="rowgroup"`), a Details link per row (`?code=…#code-details`) that renders the
details below the table, and links to the CSV (`/compare/<slug>/codes.csv`) and to the code
table of the federal parent. A draft, retired or unknown slug answers a 404 page with
`noindex`. `e2e/drill-down.spec.ts` reads it with JavaScript off.

**Built in M5 step 7** for `/compare/states/<st>-vs-<st>[…]`, the comparison of 2–4 states:
title "<A> vs <B> medical frailty codes | …", **always `noindex`** (2-state pages too: 51 × 50 / 2
= 1,275 pairs alone would be thin, near-duplicate pages, and every fact on them is already on the
state pages, which carry each state's most similar states and their similarity as text), and not
in the sitemap. The canonical is the states in **alphabetical order** with no query
(`/compare/states/ga-vs-mt` for `mt-vs-ga`), since the order only changes the columns. The HTML
carries the summary, a GET form for the pickers (`/compare/states?states=…` redirects to the
comparison), one page of groups as a real table, a link to show every code or only the
differences, and the CSV. Capitals redirect (301) to lowercase; an unknown state, one, five or a
repeated state answers a 404 page with `noindex`. The state pages' "States with the most similar
lists" is a GET form too. `e2e/states-compare.spec.ts` reads both with JavaScript off.

**Built with the compare tabs** (2026-11-02): every `/compare` page carries the same tab row
under its `<h1>` as the Vue pages (`<nav aria-label="Compare views">`, from `compareTabs` in
`packages/shared/src/compare-tabs.ts`; `aria-current="page"` on the page itself, `"true"` on
the parent of a category page or a comparison). Two new pages are **indexed and in the
sitemap**: `/compare/categories` (every published unified category under its federal
category, each linking to its page, with its definition) and `/compare/map` (the home page's
tile map as a table with a GET form for the category; `?category=` keeps the canonical bare,
as on the home page). `/compare/states` without `?states=` is the "States side by side"
landing: a GET form for "Your state" (`?state=ga` adds that state's most similar states, the
state page's section) and the comparison's pickers as a GET form. It is **`noindex`** and not
in the sitemap, like the comparisons: it holds no facts of its own, and `?state=` repeats the
state page's. `categories` and `map` are reserved unified slugs. Tested in
`apps/api/src/routes/compare-tabs-pages.test.ts`.

**Built in M6 step 5** for `/codes/<system>/<code>`, from the API's own loader (`publicCode`;
one matcher). Title "F20.0 Paranoid schizophrenia: medical frailty status in 4 states | …"
(CPT: "CPT 99213: …", never a name), description from the counts and the including states'
names. Near the top a "Summary" region: "n of N states with a list on this site include F20.0."
and one plain sentence per state with a list (`codeDetailSummary` in
`packages/shared/src/code-detail.ts`, shown by the Vue page too), grouped "Included" then "Not
included"; then "Last updated on this site <day>" (the newest published list, the same as
`dateModified`). Then the same groups and tables as the Vue page, each entry with its source
document, date and locator; CPT only with the state's own text. Like codes in their own section.
`e2e/code-page.spec.ts` reads it with JavaScript off, and axe checks it in light and dark.

- **Canonical and redirects:** the canonical is `codeUrlPath` (`/codes/icd-10-cm/F20.0`). Any
  other spelling (`f200`, `F200`, `f20.0`, `ICD-10-CM`) answers **301** there, query kept; the
  Vue page does the same with `router.replace`. A malformed or unknown code (not in `ref_codes`,
  not listed or covered by any published state) answers the 404 page with `noindex`.
- **Indexing rule** (decided in M6 step 5): a code page is indexed, and in the sitemap, only
  when **at least one published state includes the code** (listed, or covered by a wildcard or
  range). A code only CMS knows is a valid page but `noindex`; so is a code with only narrower
  codes listed. That keeps about 100,000 thin pages out of the index.
- **`X-Robots-Tag: noindex`** goes with every `noindex` page's HTML (the meta tag too), and
  `/search` is now served by the Worker with both (heading and intro only; the search runs in the
  browser).
- Code tables in the HTML (single codes, drill-down, states side by side) link each single code
  to its page.

**Built in M8 step 4** for `/about` (About and methodology), `/disclaimer`, `/privacy` and
`/accessibility`: indexed, canonical the bare path, in `/sitemaps/pages.xml` (no `lastmod`: the
words are fixed). The words are data in `packages/shared/src/about.ts` (headings, paragraphs,
lists, links), rendered by the Vue `InfoPageView` and by `seo/info-page.ts`; no HTML strings.
About's sections have stable anchors other pages link to ("learn more" links, `learnMore`):
`#what-this-is`, `#sources`, `#matching`, `#like-codes`, `#badges`, `#categories`, `#review`,
`#coverage`, `#similarity`, `#downloads`, `#court-rulings`, `#cpt`, `#report`. Every
server-rendered page's footer now has the links (About, Disclaimer, Privacy, Accessibility,
Source code, Report a problem), "Data last updated <day>" (the newest published list's
`content_updated_at`: from the state summaries on pages that read them, else one aggregate,
`listsUpdatedAt`, on a cache miss) and the short AMA notice. `e2e/about.spec.ts` opens each page.

Full Vue server-side rendering was considered and rejected: more work, and it ties the front
end to the Worker.

### 2. One page per thing, with stable readable URLs (M1 data model, M3–M6)

- `/states/<st>` (e.g. `/states/ga`), `/codes/<system>/<code>` (e.g.
  `/codes/icd-10-cm/F20.0`), `/compare` (the overview, indexed), `/compare/categories` and
  `/compare/map` (indexed), `/compare/<slug>` (a category, indexed bare),
  `/compare/states` and `/compare/states/<st>-vs-<st>` (`noindex`), `/compare/codes?...`
  (shareable, but `noindex` for combinations;
  each state and code page is the canonical home of its facts).
- Each page gets its own `<title>` and meta description built from its data, e.g.
  "F20.0 Paranoid schizophrenia: medical frailty status in 4 states".
- URLs never change once published. If one must, the Worker returns a 301.

### 3. Structured data (M3–M6)

- State page: schema.org `Dataset` with `name`, `description`, `creator` (this site),
  `isBasedOn` / `citation` (the state's source document URL), `dateModified`,
  `temporalCoverage`, `spatialCoverage` (the state), and `distribution` (CSV and JSON downloads).
- Code page: `DefinedTerm` (code, name, `inDefinedTermSet` = the code system) plus the
  per-state status as visible text. Built (M6 step 5): a `WebPage` (name, description, url,
  publisher, `dateModified`) whose `mainEntity` is the `DefinedTerm`: `termCode`, `name` (the CMS
  text; without one, the first listing state's own text with `disambiguatingDescription` "As
  published by <state> (<document>)", else no name; never an AMA descriptor), `url`, and
  `inDefinedTermSet` (`DefinedTermSet` with the code system's name and official URL,
  `codeSystemSetUrls`; drug classes have none).
- Site-wide: `WebSite` and `Organization` on the home page.
- Validate with Google's Rich Results Test before launch (M8).
- Built (M3 step 4): `Dataset` on state pages (no `license` yet: the legal team decides what
  licence the compiled lists carry; `docs/legal-review.md`, item 1), `WebSite` on the home page.
- **Built (M8 step 3):** the home page's `WebSite` names this site as `publisher`
  (`Organization`, `siteOrganization` in `seo/pages.ts`). The compare tabs `/compare`,
  `/compare/categories` and `/compare/map` are `CollectionPage`s; a bare category page
  (`/compare/<slug>`) is a `Dataset` (the table caption as name, the definition plus "A comparison
  category: …" as description, since Google wants at least 50 characters, the CSV download as
  `distribution`); About is an `AboutPage` and the other info pages are `WebPage`s
  (`pageJsonLd`). Pages that are not indexed (a state with no list, a states comparison, search,
  a filtered category page) carry none. `apps/api/src/seo/json-ld.test.ts` checks every page
  type for `@context`, its expected types and their fields (Dataset: name, description of
  50–5,000 characters, url, creator, each download's format and URL; pages: name, description,
  url; `DefinedTerm`: `termCode`, url, the set's name), with site URLs on the request's origin.
- **Rich Results Test (project lead, once on preview).** Preview is behind Access, so Google
  cannot fetch it: sign in, open each page below, view the page source (Ctrl+U), copy it all
  and paste it into the **Code** tab of <https://search.google.com/test/rich-results>. Google
  reports only the types it has rich results for (here `Dataset`); paste the same source into
  <https://validator.schema.org/> for the rest (`WebSite`, `CollectionPage`, `AboutPage`,
  `WebPage`, `DefinedTerm`). Expect no errors; a missing `license` warning on `Dataset` is known
  (legal team). Pages, on the preview host from the `preview` environment's `SITE_URL`:
  `/` (WebSite), `/states/mt` (Dataset), `/compare/serious-mental-illness` (Dataset),
  `/compare`, `/compare/categories`, `/compare/map` (CollectionPage),
  `/codes/icd-10-cm/F20.0` (WebPage with DefinedTerm), `/about` (AboutPage), `/privacy`
  (WebPage). After launch, run the URL mode on the public host once.

### 4. Facts that AI can quote correctly (M3–M6)

- State the answer in plain sentences near the top, not only in a table: "Louisiana’s list
  includes F20.0. State’s rule: Enough by itself (inferred by this site)." (code pages since
  M6 step 5, in the M6 step 3b wording)
- Every fact shows its source (state document, page) and the date the state published it.
  This is already a rule for CPT text (`docs/data-model.md`).
- "Last updated" date on every page, matching `dateModified` in the JSON-LD and `lastmod`
  in the sitemap.
- Short "what this means" notes next to badges, linking to the methodology page (the "Learn
  more" links, M8 step 4).

### 5. Open data downloads (M3)

Each published state list is downloadable as CSV and JSON from its state page, with the
source citation and publish date in the file. Built in M3 step 4:
`/states/<st>/codes.csv` (one row per entry, source title, URL and date on every row; CSV
injection guarded) and `/states/<st>/codes.json` (the citation once, then the entries). Researchers and AI tools cite downloads more
accurately than scraped tables.

### 6. Sitemap and robots.txt (M3, M8)

- `/sitemap.xml` generated by the Worker from D1: home, about/methodology, every state page,
  every code page that at least one state lists, each with `lastmod`. Split into a sitemap
  index if it passes 50,000 URLs.
- Built in M3 step 4 for the home page and the 51 state pages; URLs use the request's own
  origin. `/compare` joined in M5 step 5, every published category drill-down
  (`/compare/<slug>`, `lastmod` the newer of the category's last edit and the newest state
  list) in M5 step 6, `/compare/categories` and `/compare/map` with the compare tabs (`lastmod`
  the newest state list). Code pages join it in M6.
- **Built in M6 step 5:** `/sitemap.xml` is a **sitemap index**: `/sitemaps/pages.xml` (every
  page above) and `/sitemaps/codes-<n>.xml`, at most 50,000 URLs each (`SITEMAP_MAX_URLS`; a
  code URL is about 110 bytes, so a full file is about 5.5 MB, far under 50 MB). The code files
  list every included code (the indexing rule above), by code system and code, `lastmod` the
  newest published list. Covered codes are expanded from `ref_codes`, so a CPT range adds only
  its two ends. Query: `src/db/public-code-sitemap.ts` (distinct wildcards and ranges, then
  `CROSS JOIN` range scans of `ref_codes`'s primary key; local D1 chose a full scan otherwise,
  24 s instead of 14 ms). Counts: 8,004 codes on the local seed, about 19,400 with the four
  full lists; 50 states could pass 50,000, hence the index. Rows read per request (estimated;
  local D1 does not report them): about 44,000 on the seed (published entries scanned three
  times, 7,900 `ref_codes` rows); the index runs the same query once for its count.
- At launch, add `Sitemap: https://<final-domain>/sitemap.xml` to the public `robots.txt`.

### 6a. Icons, share image, titles and security.txt (M8 step 4)

- **Files** in `apps/web/public/` (Vite copies them to the build root; the Worker serves them
  as static assets): `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` (180 px, square
  corners; iOS rounds them), `icon-192.png`, `icon-512.png`, `site.webmanifest`
  (`display: browser`; the site is linked pages, not an app) and `og-image.png` (1200×630).
  `node scripts/make-icons.ts` writes all of them with `sharp`; they are committed, so builds
  never run it. `scripts/make-icons.test.ts` checks the committed files match the generator,
  the sizes and the design tokens. The mark (2026-11-04, from an image the project lead made):
  two list cards side by side, navy (`--color-primary`) and steel blue (`#3f6fa3`), overlapping;
  the overlap is gold (`--color-highlight`) with a white check, for the codes both lists share.
  The favicon (SVG and 32 px) uses two thick list lines per card on the 16 px pixel grid and a
  thicker check, so it reads at 16 px; the header shows that version with a white outline
  (`logo-header.svg`) so the navy card shows on the navy header;
  the Apple icon puts the mark on white; the share image is white with navy text. No CCF name or
  logo.
- **Head tags on every page.** `apps/web/index.html` links the icons (SVG, then the 32 px PNG),
  the Apple touch icon, the manifest and `theme-color` for light (`#0c2a59`) and dark
  (`#031b3f`, the dark header). The Worker's `headTags` (`apps/api/src/seo/pages.ts`) drops
  index.html's copies and writes the same set plus canonical, `og:type`, `og:site_name`,
  `og:title`, `og:description`, `og:url` (canonical), `og:image` (absolute, on the request's
  origin) with type, size and alt, and `twitter:card=summary_large_image`. Paths and colours:
  `SITE_ICONS`, `THEME_COLORS`, `SHARE_IMAGE` in `packages/shared/src/public.ts`.
- **Titles and descriptions.** Every page has its own title and meta description, the same in
  both renderers: `pageTitles`, `pageDescriptions`, `stateDescription`, `drillDescription`,
  `statesCompareDescription` and the per-page constants (`OVERVIEW_DESCRIPTION`, …). In the
  browser `usePageMeta` (`apps/web/src/lib/page-meta.ts`) sets the title, description and the
  Open Graph tags on each navigation. Admin pages share one title (`pageTitles.admin`).
  `apps/api/src/routes/site-basics.test.ts` checks each public page type has a non-empty,
  unique title and description; `page-meta.test.ts` checks every Vue page sets them.
- **`/.well-known/security.txt`** (RFC 9116, `apps/api/src/routes/security-txt.ts`): Contact
  is GitHub private vulnerability reporting, `Expires` is computed per request (midnight UTC
  365 days ahead, so it never goes stale), `Preferred-Languages: en`, `Canonical` on the
  request's host over https, `Policy` is `SECURITY.md` on GitHub. Like `robots.txt`, the site
  gate lets it through without signing in while the site is private (`X-Robots-Tag: noindex,
  nofollow` still set).
- **Print:** a `@media print` block at the end of `main.css` prints black on white, hides
  navigation, the theme menu, forms and buttons, shows tables at full width, repeats `thead`
  on each page and keeps rows whole. Link URLs are not printed (CSS cannot tell a short one).

### 7. llms.txt (M8)

A short Markdown file at `/llms.txt`: what the site is, how to read a state's status, links to
the methodology page, every state page and the data downloads. It is an emerging convention,
not a standard, and costs almost nothing.

**Built (M8 step 3):** `apps/api/src/routes/llms-txt.ts`, in the <https://llmstxt.org> layout:
`# Medical Frailty Coding Dashboard`, the home description as the `>` summary, the home intro,
what an entry is and the footer disclaimer, then link lists: **Start here** (About and
methodology, All states, Search codes), **Compare** (every compare tab with its description,
then every published category page), **State lists** (each state with a list, with its entry
count), **Data downloads** (each list's CSV and JSON) and **Optional** (the disclaimer, privacy
and accessibility pages, the sitemap). Every word and path comes from the shared data the pages
use (`compareTabs`, `infoPages`, `pageDescriptions`, …), absolute URLs on the request's origin,
cached like the sitemap (`publicCache`). `apps/api/src/routes/llms-txt.test.ts` fetches every link
through the Worker (static files answer 404 there) and expects 200. Like `robots.txt`, it is
readable without signing in while the site is private, and then says only "This site is not
public yet." with no links (`X-Robots-Tag: noindex, nofollow` still set).

### 8. Cloudflare settings (step 7 and go-live)

- Keep **Block AI bots** / managed robots.txt **off**, and set AI Crawl Control to allow.
  Cloudflare blocks AI crawlers by default on new domains, which would silently undo this
  page.
- If Bot Fight Mode or the WAF are turned on, confirm verified crawlers are not challenged.
- No pay-per-crawl.

**What the project lead checks in the dashboard (M8 step 3; nothing changed by code).** Most of
these settings belong to a zone (a domain), so on the `workers.dev` host there may be nothing to
set yet; check again when the domain is added (`docs/deployment.md`, "Going live", steps 6 and
8).

1. **Security → Bots** (zone): **Bot Fight Mode off** until a domain exists and we decide to
   use it; if it is ever on, verified bots (Googlebot, Bingbot, the AI crawlers) must not be
   challenged.
2. **Security → Bots** (zone): **"Block AI bots" off** (the toggle for AI scrapers and
   crawlers, on by default for new domains).
3. **AI Crawl Control** (zone): every crawler set to **Allow**, no pay-per-crawl.
4. **Managed robots.txt off** (Security → Bots, "Instruct AI bot traffic with robots.txt"): we
   serve our own `robots.txt` with `Content-Signal` (`apps/api/src/routes/robots.ts`), and a
   managed one would be prepended to it.
5. After launch, open `/robots.txt` and `/llms.txt` on the public host and check they are ours,
   unchanged.

### 9. Speed and accessibility (M8)

Already planned: Lighthouse ≥ 90 on the home page and axe clean in both themes. Both are
search ranking factors.

**Performance pass (M8 step 3, 2026-11-03).** Lighthouse 13.6.0, mobile (its default throttling),
against a local production build served by `wrangler dev` with the e2e seed (Montana only):

| Page | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| `/` before → after | 69 → 97 | 100 | 96 | 100 |
| `/states/mt` before → after | 76 → 97 | 100 | 96 | 100 |
| `/codes/icd-10-cm/F20.0` before → after | 75 → 96 | 100 | 96 | 100 |

- **Cause:** layout shift (CLS 0.44–0.59). Vue mounts with a loading state, so the footer sat
  near the top and jumped down when the data came; and the swap from the fallback font to
  Source Sans moved the server-rendered table. **Fixes:** `<main>` is at least a screen tall
  (`min-h-screen` in `App.vue`), so the footer starts below the fold; the Latin files of Source
  Sans 3 and Jost are preloaded (`preloadFonts` in `apps/web/vite.config.ts`, after the build
  names them). CLS is now 0, TBT 60–70 ms, LCP about 2.6 s.
- Already fine: every route is lazy (file-based routes), so pdf.js, the parser worker and the
  ingest screen load only on admin pages; fonts use `font-display: swap` and the other subsets
  load by `unicode-range` only when a page needs them; the only blocking script is the tiny
  `theme-init.js`, kept so the theme never flashes.
- **Bundle budget:** `scripts/bundle-budget.ts` (`pnpm budget`), a `pnpm check:full` stage right
  after the build (so CI runs it on every pull request). It measures gzip and brotli of every
  script and style sheet in `apps/web/dist` and fails when the first load of every page
  (`initial`: what `index.html` loads) or a named chunk is over its budget, when any other
  chunk passes 7,000 B brotli, or when admin-only code (`pdf`, `pdf.worker.min`, `pdf-layout`,
  `worker`, `ingest`) is in the first load. Budgets are the 2026-11-03 sizes plus about 10%:
  first load 112.1 KiB brotli / 127.9 KiB gzip (budget 127,000 / 145,000 B). Raise a number
  in the same pull request as a change that needs it, and say why.
- **Left for later:** the shared package (`@mfcd/shared`, 57 KiB brotli) is in every page's first
  load with zod and every admin schema, because module-level `z.object(...)` calls cannot be
  tree-shaken; Lighthouse counts about 32 KiB of it unused on the home page. Splitting admin
  schemas into a subpath import (like `@mfcd/shared/us-map`) would cut it. pdf.js is bundled
  twice (the page's copy and the parser worker's; admin only). Best practices is 96 because of
  a CSP issue Chrome reports without a URL on `http://localhost` (no violation in the console);
  re-check on preview over HTTPS.

## Cost

The Worker renders every public page, so crawler requests count as Worker requests. The HTML cache keeps D1 reads low, but not Worker requests. The account is
on **Workers Paid**, which includes 10M requests a month. Watch the Cloudflare usage notification
after launch.
