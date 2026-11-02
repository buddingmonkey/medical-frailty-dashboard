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
| Content signals | `Content-Signal: search=yes, ai-input=yes, ai-train=yes` (project lead, 2026-11-01). **Provisional:** pages quote states' CPT descriptions, which are AMA-copyrighted, so the legal team may ask to change `ai-train` (`docs/status.md`) |
| Rendering | The Worker sends real HTML for every public page (below). Vue takes over in the browser |
| Domain | Bought in M7, or the site is given to an organization that hosts it on its own domain. Either way, nothing may hard-code the `workers.dev` host |

## Requirements

### 1. Server-rendered HTML for public pages (M3–M5)

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
`noindex`. Code pages follow in M5. `e2e/no-js.spec.ts` reads a state page with JavaScript
off.

Full Vue server-side rendering was considered and rejected: more work, and it ties the front
end to the Worker.

### 2. One page per thing, with stable readable URLs (M1 data model, M3–M5)

- `/states/<st>` (e.g. `/states/ga`), `/codes/<system>/<code>` (e.g.
  `/codes/icd-10-cm/F20.0`), `/compare?...` (shareable, but `noindex` for combinations;
  each state and code page is the canonical home of its facts).
- Each page gets its own `<title>` and meta description built from its data, e.g.
  "F20.0 Paranoid schizophrenia: medical frailty status in 4 states".
- URLs never change once published. If one must, the Worker returns a 301.

### 3. Structured data (M3–M5)

- State page: schema.org `Dataset` with `name`, `description`, `creator` (this site),
  `isBasedOn` / `citation` (the state's source document URL), `dateModified`,
  `temporalCoverage`, `spatialCoverage` (the state), and `distribution` (CSV and JSON downloads).
- Code page: `DefinedTerm` (code, name, `inDefinedTermSet` = the code system) plus the
  per-state status as visible text.
- Site-wide: `WebSite` and `Organization` on the home page.
- Validate with Google's Rich Results Test before launch (M7).
- Built (M3 step 4): `Dataset` on state pages (no `license` yet: the legal team decides what
  licence the compiled lists carry; `docs/status.md`), `WebSite` on the home page.

### 4. Facts that AI can quote correctly (M3–M5)

- State the answer in plain sentences near the top, not only in a table: "Louisiana lists
  F20.0. Code designation 0: qualifies alone (inferred)."
- Every fact shows its source (state document, page) and the date the state published it.
  This is already a rule for CPT text (`docs/data-model.md`).
- "Last updated" date on every page, matching `dateModified` in the JSON-LD and `lastmod`
  in the sitemap.
- Short "what this means" notes next to badges, linking to the methodology page (M7).

### 5. Open data downloads (M3)

Each published state list is downloadable as CSV and JSON from its state page, with the
source citation and publish date in the file. Built in M3 step 4:
`/states/<st>/codes.csv` (one row per entry, source title, URL and date on every row; CSV
injection guarded) and `/states/<st>/codes.json` (the citation once, then the entries). Researchers and AI tools cite downloads more
accurately than scraped tables.

### 6. Sitemap and robots.txt (M3, M7)

- `/sitemap.xml` generated by the Worker from D1: home, about/methodology, every state page,
  every code page that at least one state lists, each with `lastmod`. Split into a sitemap
  index if it passes 50,000 URLs.
- Built in M3 step 4 for the home page and the 51 state pages; URLs use the request's own
  origin. Code pages join it in M5.
- At launch, add `Sitemap: https://<final-domain>/sitemap.xml` to the public `robots.txt`.

### 7. llms.txt (M7)

A short Markdown file at `/llms.txt`: what the site is, how to read a state's status, links to
the methodology page, every state page and the data downloads. It is an emerging convention,
not a standard, and costs almost nothing.

### 8. Cloudflare settings (step 7 and go-live)

- Keep **Block AI bots** / managed robots.txt **off**, and set AI Crawl Control to allow.
  Cloudflare blocks AI crawlers by default on new domains, which would silently undo this
  page.
- If Bot Fight Mode or the WAF are turned on, confirm verified crawlers are not challenged.
- No pay-per-crawl.

### 9. Speed and accessibility (M7)

Already planned: Lighthouse ≥ 90 on the home page and axe clean in both themes. Both are
search ranking factors.

## Cost

The Worker renders every public page, so crawler requests count toward the free 100,000
Worker requests a day. The HTML cache keeps D1 reads low, but not Worker requests. If crawlers
push past the free tier, switch to **Workers Paid ($5/month)**, as `docs/deployment.md` already
plans. Watch the Cloudflare usage notification after launch.
