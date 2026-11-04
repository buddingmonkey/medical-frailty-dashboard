import { SITE_NAME } from '@mfcd/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import { call } from '../test/access-fixtures'
import { seedStatesCompare } from '../test/overview-fixtures'

// Structured data on each indexed page type (roadmap M8 step 3; docs/seo.md, "Structured data"):
// every JSON-LD block names schema.org, has a type this site uses, and carries the fields that
// type needs here (Google's required and recommended fields for a Dataset; name, description and
// url for a page). Google's Rich Results Test is the final check on preview (docs/seo.md).
// Fixture: `seedStatesCompare` (GA, MT and NE have a list, LA has announced one).

const HOST = 'frailty.example.org'
const ORIGIN = `http://${HOST}`

type Node = Record<string, unknown>

/** A built index.html with a <head>, where the Worker writes the JSON-LD. */
const assets: Fetcher = {
  fetch: () =>
    Promise.resolve(
      new Response(
        '<!doctype html><html><head><title>app</title></head><body><div id="app"></div></body></html>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      ),
    ),
  connect: () => {
    throw new Error('not used in tests')
  },
}

function get(path: string) {
  return call(path, { host: HOST, vars: { SITE_MODE: 'public', ASSETS: assets } })
}

function jsonLdOf(html: string): Node[] {
  const open = '<script type="application/ld+json">'
  return html
    .split(open)
    .slice(1)
    .map((part) => JSON.parse(part.slice(0, part.indexOf('</script>'))) as Node)
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isUrl = (v: unknown): boolean => isText(v) && /^https?:\/\/\S+$/.test(v)
const asNodes = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : v ? [v as Node] : [])

/** Problems with one node, by its schema.org type; [] when it is complete. */
function problems(node: Node, where: string): string[] {
  const out: string[] = []
  const need = (ok: boolean, field: string) => {
    if (!ok) out.push(`${where} ${String(node['@type'])}: ${field}`)
  }
  switch (node['@type']) {
    case 'WebSite':
      need(isText(node['name']), 'name')
      need(isUrl(node['url']), 'url')
      need(
        asNodes(node['publisher']).some((p) => p['@type'] === 'Organization'),
        'publisher',
      )
      break
    case 'Organization':
      need(isText(node['name']), 'name')
      break
    case 'Dataset': {
      // Google: name and description (50 to 5,000 characters) are required.
      const description = node['description']
      need(isText(node['name']), 'name')
      need(
        isText(description) && description.length >= 50 && description.length <= 5000,
        'description (50–5,000 characters)',
      )
      need(isUrl(node['url']), 'url')
      need(
        asNodes(node['creator']).some((c) => isText(c['name'])),
        'creator',
      )
      const downloads = asNodes(node['distribution'])
      need(downloads.length > 0, 'distribution')
      for (const d of downloads) {
        need(d['@type'] === 'DataDownload', 'distribution @type')
        need(isText(d['encodingFormat']), 'distribution encodingFormat')
        need(isUrl(d['contentUrl']), 'distribution contentUrl')
      }
      break
    }
    case 'WebPage':
    case 'CollectionPage':
    case 'AboutPage':
      need(isText(node['name']), 'name')
      need(isText(node['description']), 'description')
      need(isUrl(node['url']), 'url')
      if (node['mainEntity'] !== undefined) {
        for (const e of asNodes(node['mainEntity'])) out.push(...problems(e, `${where} mainEntity`))
      }
      break
    case 'DefinedTerm':
      need(isText(node['termCode']), 'termCode')
      need(isUrl(node['url']), 'url')
      need(isText(asNodes(node['inDefinedTermSet'])[0]?.['name']), 'inDefinedTermSet name')
      break
    default:
      out.push(`${where}: unexpected @type ${String(node['@type'])}`)
  }
  return out
}

/** Every absolute URL anywhere in the data. */
function urlsIn(value: unknown): string[] {
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? [value] : []
  if (Array.isArray(value)) return value.flatMap(urlsIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(urlsIn)
  return []
}

/** Each indexed page type, one example address, and the top-level types it must carry. */
const PAGES: [path: string, types: string[]][] = [
  ['/', ['WebSite']],
  ['/states/ga', ['Dataset']],
  ['/compare', ['CollectionPage']],
  ['/compare/categories', ['CollectionPage']],
  ['/compare/map', ['CollectionPage']],
  ['/compare/serious-mental-illness', ['Dataset']],
  ['/codes/icd-10-cm/F20.0', ['WebPage']],
  ['/about', ['AboutPage']],
  ['/privacy', ['WebPage']],
]

beforeEach(async () => {
  await seedStatesCompare()
})

describe('JSON-LD on each page type', () => {
  it.each(PAGES)('%s has complete schema.org data', async (path, types) => {
    const res = await get(path)
    expect(res.status).toBe(200)
    const nodes = jsonLdOf(await res.text())

    expect(nodes.map((n) => n['@type'])).toEqual(types)
    for (const node of nodes) {
      expect(node['@context']).toBe('https://schema.org')
      expect(problems(node, path)).toEqual([])
      // Site URLs are on the request's own origin; off-site ones are the states' documents and
      // the code systems' pages.
      for (const url of urlsIn(node)) {
        if (new URL(url).host === HOST) expect(url.startsWith(`${ORIGIN}/`), url).toBe(true)
      }
    }
  })

  it('names this site as the home page’s publisher and links the state downloads', async () => {
    const [site] = jsonLdOf(await (await get('/')).text())
    expect(site).toMatchObject({
      url: `${ORIGIN}/`,
      publisher: { '@type': 'Organization', name: SITE_NAME, url: `${ORIGIN}/` },
    })

    const [dataset] = jsonLdOf(await (await get('/compare/serious-mental-illness')).text())
    expect(dataset).toMatchObject({
      url: `${ORIGIN}/compare/serious-mental-illness`,
      distribution: [
        {
          encodingFormat: 'text/csv',
          contentUrl: `${ORIGIN}/compare/serious-mental-illness/codes.csv`,
        },
      ],
    })
  })

  it('leaves structured data off pages that are not indexed', async () => {
    for (const path of ['/states/la', '/compare/states/ga-vs-mt', '/search']) {
      const html = await (await get(path)).text()
      expect(jsonLdOf(html), path).toEqual([])
    }
  })
})
