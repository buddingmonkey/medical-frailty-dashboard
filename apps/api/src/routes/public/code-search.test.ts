import { type CodeSearchResponse, codeSearchResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { call } from '../../test/access-fixtures'
import { seedSearch } from '../../test/search-fixtures'

// GET /api/public/codes/search (roadmap M6 step 1). The fixture is in src/test/search-fixtures.ts:
// CMS rows for F20–F25, J12 and two HCPCS codes; GA, LA and MT published; a GA draft and NE's
// unpublished list that must never show.

let calls = 0

async function search(query: string, options: { method?: string } = {}) {
  calls += 1
  return call(`/api/public/codes/search?${query}`, {
    host: `search-${String(calls)}.example.com`,
    vars: { SITE_MODE: 'public' },
    ...options,
  })
}

async function results(query: string): Promise<CodeSearchResponse> {
  const res = await search(query)
  expect(res.status).toBe(200)
  return codeSearchResponseSchema.parse(await res.json())
}

const codes = (body: CodeSearchResponse) => body.results.map((r) => `${r.system}:${r.code}`)

beforeEach(async () => {
  await seedSearch(env.DB)
})

describe('GET /api/public/codes/search: code numbers', () => {
  it('reaches search, not a code page: prefix matches with the exact code first', async () => {
    const body = await results('q=F20')
    expect(body.query).toEqual({ q: 'F20', kind: 'code', states: [], system: null, limit: 20 })
    expect(codes(body)).toEqual(['icd10cm:F20', 'icd10cm:F20.0', 'icd10cm:F20.9'])
    const [f20, f200, f209] = body.results
    expect(f20).toMatchObject({
      url: '/codes/icd-10-cm/F20',
      description: 'Schizophrenia',
      descriptionSource: 'cms',
      listedBy: { count: 0, states: [] },
    })
    // The current CMS text, and only published lists (not NE's unpublished one).
    expect(f200).toMatchObject({
      description: 'Paranoid schizophrenia',
      listedBy: { count: 2, states: ['ga', 'la'] },
    })
    expect(f209?.listedBy).toEqual({ count: 1, states: ['mt'] })
  })

  it('reads f20.0 like F20.0', async () => {
    const body = await results('q=f20.0')
    expect(codes(body)).toEqual(['icd10cm:F20.0'])
  })

  it('reads J1234 as HCPCS first, and J12.34 as ICD-10-CM only', async () => {
    expect(codes(await results('q=J1234'))).toEqual(['hcpcs:J1234'])
    expect(codes(await results('q=J12.34'))).toEqual([])
    expect(codes(await results('q=J12'))).toEqual([
      'icd10cm:J12',
      'hcpcs:J1230',
      'hcpcs:J1234',
      'icd10cm:J12.81',
    ])
  })

  it('finds a CPT code only through the states that list it, with their own text', async () => {
    const body = await results('q=99213')
    expect(body.results).toEqual([
      {
        system: 'cpt',
        codeNorm: '99213',
        code: '99213',
        url: '/codes/cpt/99213',
        description: 'Established patient office visit',
        descriptionSource: 'state',
        descriptionState: { slug: 'ga', name: 'Georgia' },
        listedBy: { count: 2, states: ['ga', 'la'] },
      },
    ])
  })

  it('counts only exact listings (a wildcard F10 is not F10 listed)', async () => {
    expect(codes(await results('q=F10'))).toEqual([])
  })

  it('filters by code system and state, and stops at the limit', async () => {
    expect(codes(await results('q=J12&system=hcpcs'))).toEqual(['hcpcs:J1230', 'hcpcs:J1234'])
    expect(codes(await results('q=F20&states=mt'))).toEqual(['icd10cm:F20.9'])
    expect(codes(await results('q=F20&states=LA,mt'))).toEqual(['icd10cm:F20.0', 'icd10cm:F20.9'])
    expect(codes(await results('q=F20&states=ne'))).toEqual([])
    expect(codes(await results('q=F20&limit=1'))).toEqual(['icd10cm:F20'])
  })
})

describe('GET /api/public/codes/search: words', () => {
  it('matches CMS text for codes no state lists, ranked by bm25', async () => {
    const body = await results('q=paranoid schizophrenia')
    expect(body.query.kind).toBe('words')
    expect(codes(body)[0]).toBe('icd10cm:F20.0')

    const all = await results('q=schizophrenia')
    expect(codes(all)).toEqual(
      expect.arrayContaining(['icd10cm:F20', 'icd10cm:F20.0', 'icd10cm:F20.9']),
    )
    // The shortest text that is all match ranks first.
    expect(codes(all)[0]).toBe('icd10cm:F20')
    expect(all.results.find((r) => r.code === 'F20')?.listedBy.count).toBe(0)
  })

  it('takes the last word as a prefix, for type-ahead', async () => {
    expect(codes(await results('q=schizoaff'))).toEqual(['icd10cm:F25', 'icd10cm:F25.0'])
  })

  it('stems CMS text: "disorders" finds "disorder" and "disorders" (porter)', async () => {
    const found = codes(await results('q=schizoaffective%20disorders%20bipolar'))
    expect(found).toEqual(['icd10cm:F25.0'])
  })

  it('finds state text too, and CPT codes only there', async () => {
    const body = await results('q=office visit')
    expect(codes(body)).toEqual(['cpt:99213'])
    expect(body.results[0]?.descriptionSource).toBe('state')
  })

  it("never shows a draft's codes or text", async () => {
    const body = await results('q=draft')
    expect(body.results).toEqual([])
    const f25 = (await results('q=schizoaffective disorders')).results.find((r) => r.code === 'F25')
    expect(f25?.listedBy.count).toBe(0)
  })

  it('narrows words to codes the chosen states list, by CMS or state text', async () => {
    expect(codes(await results('q=schizophrenia&states=mt'))).toEqual(['icd10cm:F20.9'])
    expect(codes(await results('q=paranoid&states=ga'))).toEqual(['icd10cm:F20.0'])
    expect(codes(await results('q=injection&system=hcpcs&states=ga'))).toEqual(['hcpcs:J1234'])
  })

  it('folds case and accents, and takes other scripts', async () => {
    expect(codes(await results(`q=${encodeURIComponent('SCHIZOPHRÉNIA')}`))).toContain(
      'icd10cm:F20',
    )
    expect((await results(`q=${encodeURIComponent('糖尿病')}`)).results).toEqual([])
  })

  it.each([
    '" OR 1=1 --',
    'NEAR(schizophrenia paranoid)',
    'description:paranoid',
    'paranoid*',
    '-paranoid',
    '(paranoid',
    'paranoid NOT schizophrenia',
    "'; DROP TABLE ref_codes; --",
    '^schizo {description}',
  ])('treats %s as plain words', async (q) => {
    const res = await search(`q=${encodeURIComponent(q)}`)
    expect(res.status).toBe(200)
    codeSearchResponseSchema.parse(await res.json())
  })

  it('reads FTS operators as words: NOT is required, not negation', async () => {
    expect(codes(await results('q=paranoid NOT schizophrenia'))).toEqual([])
    expect(codes(await results(`q=${encodeURIComponent('paranoid -schizophrenia')}`))).toEqual([
      'icd10cm:F20.0',
    ])
  })

  it('answers no results for input without a word', async () => {
    expect((await results(`q=${encodeURIComponent('*"()')}`)).results).toEqual([])
  })
})

describe('GET /api/public/codes/search: requests', () => {
  it.each([
    ['no q', ''],
    ['an empty q', 'q='],
    ['a q of spaces', 'q=%20%20'],
    ['a q over 100 characters', `q=${'a'.repeat(101)}`],
    ['a bad state list', 'q=F20&states=georgia'],
    ['an unknown state', 'q=F20&states=zz'],
    ['an unknown code system', 'q=F20&system=snomed'],
    ['a limit over the cap', 'q=F20&limit=51'],
  ])('answers 400 for %s', async (_, query) => {
    const res = await search(query)
    expect(res.status).toBe(400)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects non-GET methods', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect((await search('q=F20', { method })).status).toBe(405)
    }
  })

  it('sends dataVersion and the public cache headers', async () => {
    await env.DB.prepare(`INSERT INTO app_meta (key, value) VALUES ('data_version', '7')`).run()
    const res = await search('q=F20')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(codeSearchResponseSchema.parse(await res.json()).dataVersion).toBe(7)
  })
})
