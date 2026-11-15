import {
  aboutPage,
  CATEGORIES_DESCRIPTION,
  COMPARE_DESCRIPTION,
  type CompareTab,
  compareTabs,
  ENTRY_DEFINITION,
  FOOTER_TEXT,
  formatCount,
  HOME_INTRO,
  infoPages,
  MAP_DESCRIPTION,
  OVERLAPS_DESCRIPTION,
  OVERVIEW_DESCRIPTION,
  pageDescriptions,
  SEARCH_PAGE,
  SITE_NAME,
  STATES_LANDING_DESCRIPTION,
} from '@mfcd/shared'
import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { createDb } from '../db/client'
import { publicSummaries } from '../db/public-summary'
import { unifiedCategories } from '../db/schema'
import { publicCache } from '../middleware/public-cache'
import { isPublic } from '../middleware/site-gate'
import type { AppEnv } from '../types'

// /llms.txt (https://llmstxt.org; roadmap M8 step 3; docs/seo.md, "llms.txt"): a short Markdown
// guide for AI tools: what the site is, how to read it, and links to its pages and downloads.
// Every word and path comes from the shared data the pages use, so links follow the site, and
// llms-txt.test.ts fetches each link. Like robots.txt, it is readable without signing in while
// the site is private, and then says only that (site-gate.ts).

const PRIVATE = `# ${SITE_NAME}

> This site is not public yet.
`

/** What each compare tab shows; a new tab must add its line here. */
const TAB_NOTES: Record<CompareTab['path'], string> = {
  '/compare': OVERVIEW_DESCRIPTION,
  '/compare/categories': CATEGORIES_DESCRIPTION,
  '/compare/map': MAP_DESCRIPTION,
  '/compare/overlaps': OVERLAPS_DESCRIPTION,
  '/compare/states': STATES_LANDING_DESCRIPTION,
  '/compare/codes': COMPARE_DESCRIPTION,
}

/** `[` and `]` in link text would end it early. */
const linkText = (text: string) => text.replace(/[[\]\\]/g, (ch) => `\\${ch}`)

/** One flowing line: notes come from multi-sentence page text. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const item = (text: string, url: string, note?: string) =>
  `- [${linkText(text)}](${url})${note ? `: ${oneLine(note)}` : ''}`

export const llmsTxt = new Hono<AppEnv>()
  .get('/', async (c, next) => {
    if (isPublic(c.env)) return next()
    c.header('Cache-Control', 'public, max-age=300')
    return c.text(PRIVATE)
  })
  .get('/', publicCache, async (c) => {
    const db = createDb(c.env.DB)
    const [{ items }, categories] = await Promise.all([
      publicSummaries(db),
      db
        .select({ slug: unifiedCategories.slug, label: unifiedCategories.label })
        .from(unifiedCategories)
        .where(eq(unifiedCategories.status, 'published'))
        .orderBy(asc(unifiedCategories.sortOrder), asc(unifiedCategories.slug)),
    ])
    const base = new URL(c.req.url).origin
    const withList = items.filter((s) => s.published !== null)

    const lines = [
      `# ${SITE_NAME}`,
      '',
      `> ${oneLine(pageDescriptions.home)}`,
      '',
      oneLine(HOME_INTRO),
      '',
      `${oneLine(ENTRY_DEFINITION)} ${oneLine(FOOTER_TEXT)}`,
      '',
      '## Start here',
      '',
      item(aboutPage.heading, `${base}${aboutPage.path}`, aboutPage.description),
      item('All states', `${base}/states`, pageDescriptions.states),
      item(SEARCH_PAGE.heading, `${base}/search`, SEARCH_PAGE.intro),
      '',
      '## Compare',
      '',
      ...compareTabs.map((tab) => item(tab.label, `${base}${tab.path}`, TAB_NOTES[tab.path])),
      ...categories.map((u) => item(`${u.label} codes by state`, `${base}/compare/${u.slug}`)),
      '',
      '## State lists',
      '',
      ...withList.map((s) =>
        item(
          s.name,
          `${base}/states/${s.slug}`,
          `${formatCount(s.published?.totalEntries ?? 0)} entries`,
        ),
      ),
      '',
      '## Data downloads',
      '',
      'Each published list as CSV (one row per entry) and JSON, with the source citation on every entry.',
      '',
      ...withList.flatMap((s) => [
        item(`${s.name} (CSV)`, `${base}/states/${s.slug}/codes.csv`),
        item(`${s.name} (JSON)`, `${base}/states/${s.slug}/codes.json`),
      ]),
      '',
      '## Optional',
      '',
      ...infoPages
        .filter((page) => page.path !== aboutPage.path)
        .map((page) => item(page.heading, `${base}${page.path}`, page.description)),
      item('Sitemap', `${base}/sitemap.xml`, 'Every page, code pages included.'),
      '',
    ]
    return c.text(lines.join('\n'))
  })
