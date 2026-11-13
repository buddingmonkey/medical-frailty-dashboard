import { SHARE_IMAGE, SITE_ICONS, THEME_COLORS } from '@mfcd/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'
import { seedStatesCompare } from '../test/overview-fixtures'

// Professional site basics in the server-rendered HTML (roadmap M8 step 4; docs/seo.md, "Icons
// and share image"): every public page type links the icons, the manifest and the share image,
// sets the theme colour for both colour schemes, and has its own title and description.
// Fixture: src/test/overview-fixtures.ts (`seedStatesCompare`; GA, MT and NE have a list, LA
// has announced one).

/** The built index.html, with the head tags apps/web/index.html carries (the Worker replaces them). */
const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="Compare the code lists." />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="theme-color" content="#0c2a59" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#031b3f" media="(prefers-color-scheme: dark)" />
    <meta property="og:image" content="/og-image.png" />
    <title>Medical Frailty Coding Dashboard</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`

const assets: Fetcher = {
  fetch: () =>
    Promise.resolve(
      new Response(indexHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    ),
  connect: () => {
    throw new Error('not used in tests')
  },
}

const HOST = 'frailty.example.org'
const ORIGIN = `http://${HOST}`

function get(path: string) {
  return call(path, { host: HOST, vars: { SITE_MODE: 'public', ASSETS: assets } })
}

/** Every public page type the Worker renders, with one example address each. */
const PUBLIC_PAGES = [
  '/',
  '/states',
  '/states/ga',
  '/states/la',
  '/about',
  '/disclaimer',
  '/privacy',
  '/accessibility',
  '/search',
  '/codes/icd-10-cm/F20.0',
  '/compare',
  '/compare/categories',
  '/compare/map',
  '/compare/overlaps',
  '/compare/codes',
  '/compare/states',
  '/compare/states/ga-vs-mt',
  '/compare/serious-mental-illness',
] as const

/** The <head> of a page, whitespace collapsed (Prettier wraps long tags in the source). */
const headOf = (html: string) =>
  html.slice(html.indexOf('<head>'), html.indexOf('</head>')).replace(/\s+/g, ' ')

const count = (text: string, part: string) => text.split(part).length - 1

/** The content of the first `<meta {key}="{name}" content="…">`, unescaped enough for tests. */
function metaContent(head: string, key: 'name' | 'property', name: string): string | null {
  const m = new RegExp(`<meta ${key}="${name}" content="([^"]*)"`).exec(head)
  return m?.[1] ?? null
}

beforeEach(async () => {
  await seedStatesCompare()
})

describe('site basics in every server-rendered public page', () => {
  it.each(PUBLIC_PAGES)(
    '%s links the icons, manifest, theme colours and share image once',
    async (path) => {
      const res = await get(path)
      expect(res.status).toBe(200)
      const head = headOf(await res.text())

      expect(head).toContain(`<link rel="icon" href="${SITE_ICONS.svg}" type="image/svg+xml"`)
      expect(head).toContain(
        `<link rel="icon" href="${SITE_ICONS.png32}" type="image/png" sizes="32x32"`,
      )
      expect(head).toContain(`<link rel="apple-touch-icon" href="${SITE_ICONS.appleTouch}"`)
      expect(head).toContain(`<link rel="manifest" href="${SITE_ICONS.manifest}"`)
      expect(head).toContain(
        `<meta name="theme-color" content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)"`,
      )
      expect(head).toContain(
        `<meta name="theme-color" content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)"`,
      )
      // index.html's copies are replaced, not doubled.
      expect(count(head, 'rel="icon"')).toBe(2)
      expect(count(head, 'rel="manifest"')).toBe(1)
      expect(count(head, 'name="theme-color"')).toBe(2)
      expect(count(head, 'property="og:image"')).toBe(1)

      // Open Graph and Twitter, with absolute URLs.
      expect(metaContent(head, 'property', 'og:type')).toBe('website')
      expect(metaContent(head, 'property', 'og:title')).toBeTruthy()
      expect(metaContent(head, 'property', 'og:description')).toBeTruthy()
      expect(metaContent(head, 'property', 'og:url')?.startsWith(`${ORIGIN}/`)).toBe(true)
      expect(metaContent(head, 'property', 'og:image')).toBe(`${ORIGIN}${SHARE_IMAGE.path}`)
      expect(metaContent(head, 'property', 'og:image:width')).toBe('1200')
      expect(metaContent(head, 'property', 'og:image:height')).toBe('630')
      expect(metaContent(head, 'property', 'og:image:alt')).toBeTruthy()
      expect(metaContent(head, 'name', 'twitter:card')).toBe('summary_large_image')
    },
  )

  it('gives every public page type a non-empty title and description of its own', async () => {
    const seen = { titles: new Map<string, string>(), descriptions: new Map<string, string>() }
    for (const path of PUBLIC_PAGES) {
      const head = headOf(await (await get(path)).text())
      const title = /<title>([^<]*)<\/title>/.exec(head)?.[1] ?? ''
      const description = metaContent(head, 'name', 'description') ?? ''
      expect(title.trim(), path).not.toBe('')
      expect(description.trim(), path).not.toBe('')
      expect(metaContent(head, 'property', 'og:title'), path).toBe(title)
      expect(metaContent(head, 'property', 'og:description'), path).toBe(description)
      expect(seen.titles.get(title), `${path} repeats a title`).toBeUndefined()
      expect(seen.descriptions.get(description), `${path} repeats a description`).toBeUndefined()
      seen.titles.set(title, path)
      seen.descriptions.set(description, path)
    }
  })
})
