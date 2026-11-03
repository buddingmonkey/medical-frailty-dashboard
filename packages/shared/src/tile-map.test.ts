import { describe, expect, it } from 'vitest'

import type {
  OverviewCategory,
  OverviewCell,
  OverviewState,
  PublicOverviewResponse,
} from './overview'
import {
  TILE_MAP_COLUMNS,
  TILE_MAP_ROWS,
  tileMapCaption,
  tileMapCategory,
  tileMapQuery,
  tileMapTiles,
  usTileLayout,
} from './tile-map'

// The tile map (roadmap M5 step 8): one unified category across every state, an equal tile per
// state in a US tile-grid layout, the overview's numbers and shades.

const POSTAL = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
] // prettier-ignore

describe('usTileLayout', () => {
  it('has each state and DC once', () => {
    expect(usTileLayout).toHaveLength(51)
    expect(usTileLayout.map((t) => t.id).sort()).toEqual([...POSTAL].sort())
    expect(new Set(usTileLayout.map((t) => t.name)).size).toBe(51)
  })

  it('puts no two tiles in one cell, all inside the 11 × 8 grid', () => {
    const cells = usTileLayout.map((t) => `${String(t.row)},${String(t.col)}`)
    expect(new Set(cells).size).toBe(51)
    for (const t of usTileLayout) {
      expect(t.row).toBeGreaterThanOrEqual(0)
      expect(t.row).toBeLessThan(TILE_MAP_ROWS)
      expect(t.col).toBeGreaterThanOrEqual(0)
      expect(t.col).toBeLessThan(TILE_MAP_COLUMNS)
    }
  })

  it('places the corners as in the approved mockup', () => {
    const at = (id: string) => usTileLayout.find((t) => t.id === id)
    expect(at('AK')).toMatchObject({ row: 0, col: 0, name: 'Alaska' })
    expect(at('ME')).toMatchObject({ row: 0, col: 10 })
    expect(at('HI')).toMatchObject({ row: 7, col: 0 })
    expect(at('FL')).toMatchObject({ row: 7, col: 8 })
    expect(at('DC')).toMatchObject({ row: 5, col: 8, name: 'District of Columbia' })
  })
})

function category(id: number, fields: Partial<OverviewCategory> = {}): OverviewCategory {
  return {
    id,
    slug: `cat-${String(id)}`,
    label: `Category ${String(id)}`,
    definition: '',
    federalCategory: 'sud',
    sortOrder: 1,
    coverageBasis: 'universe',
    denominator: 10,
    ...fields,
  }
}

function cell(unifiedId: number, entries: number, share: number, reviewed = true): OverviewCell {
  return {
    unifiedId,
    entries,
    qualifiesAlone: 0,
    qualifiesAloneShare: entries > 0 ? 0 : null,
    covered: Math.round(share * 10),
    share,
    reviewed: entries > 0 && reviewed,
  }
}

const state = (id: string, name: string, cells: OverviewCell[]): OverviewState => ({
  id,
  slug: id.toLowerCase(),
  name,
  status: cells.length > 0 ? 'published' : 'none',
  hasList: cells.length > 0,
  cells,
})

const data: PublicOverviewResponse = {
  dataVersion: 1,
  categories: [
    category(1, { slug: 'psychoses', label: 'Psychoses' }),
    category(2, { slug: 'alcohol', label: 'Alcohol', coverageBasis: 'union' }),
  ],
  states: [
    state('AL', 'Alabama', []),
    state('MT', 'Montana', [cell(1, 2, 0.333), cell(2, 1, 1, false)]),
    state('NE', 'Nebraska', [cell(1, 0, 0), cell(2, 3, 0.1)]),
  ],
}

describe('tileMapCategory and tileMapQuery', () => {
  it('reads the category from the URL, the first category by default', () => {
    expect(tileMapCategory(data.categories, {})?.slug).toBe('psychoses')
    expect(tileMapCategory(data.categories, { category: 'alcohol' })?.slug).toBe('alcohol')
    expect(tileMapCategory(data.categories, { category: ['alcohol', 'x'] })?.slug).toBe('alcohol')
    expect(tileMapCategory(data.categories, { category: 'unknown' })?.slug).toBe('psychoses')
    expect(tileMapCategory([], { category: 'alcohol' })).toBeNull()
  })

  it('writes the category to the URL, leaving the default out', () => {
    expect(tileMapQuery(data.categories, 'psychoses')).toEqual({})
    expect(tileMapQuery(data.categories, 'alcohol')).toEqual({ category: 'alcohol' })
  })
})

describe('tileMapTiles', () => {
  const [psychoses, alcohol] = data.categories
  if (!psychoses || !alcohol) throw new Error('fixture')

  it('gives every state and DC a tile, in order of name', () => {
    const tiles = tileMapTiles(data, psychoses)
    expect(tiles).toHaveLength(51)
    const names = tiles.map((t) => t.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
    expect(names.slice(0, 3)).toEqual(['Alabama', 'Alaska', 'Arizona'])
  })

  it('a state with a list: number, shade, link and the overview’s accessible name', () => {
    const mt = tileMapTiles(data, psychoses).find((t) => t.id === 'MT')
    expect(mt).toMatchObject({
      text: '33%',
      tableText: '33%',
      shade: 'mid',
      notReviewed: false,
      href: '/compare/psychoses?focus=MT',
      label: 'Montana, Psychoses: 33% of the category’s diagnosis codes',
      row: 2,
      col: 2,
    })
    const mtAlcohol = tileMapTiles(data, alcohol).find((t) => t.id === 'MT')
    expect(mtAlcohol).toMatchObject({
      text: '100%',
      shade: 'high',
      notReviewed: true,
      label: 'Montana, Alcohol: 100% of the entries any state lists, not yet reviewed',
    })
  })

  it('a state with a list but nothing in the category: “None”, hatched, still a link', () => {
    const ne = tileMapTiles(data, psychoses).find((t) => t.id === 'NE')
    expect(ne).toMatchObject({
      text: 'None',
      tableText: 'None listed',
      shade: 'none',
      href: '/compare/psychoses?focus=NE',
      label: 'Nebraska, Psychoses: 0%, none listed',
    })
  })

  it('a state without a list, or missing from the response: “No list”, not a link', () => {
    const tiles = tileMapTiles(data, psychoses)
    for (const [id, name] of [
      ['AL', 'Alabama'],
      ['WY', 'Wyoming'],
    ] as const) {
      expect(tiles.find((t) => t.id === id)).toMatchObject({
        name,
        slug: id.toLowerCase(),
        text: 'No list',
        tableText: 'No list on this site yet',
        shade: 'nolist',
        notReviewed: false,
        href: null,
        label: `${name}, Psychoses: No list on this site yet`,
      })
    }
  })
})

describe('tileMapCaption', () => {
  it('says what the number is a share of', () => {
    const [psychoses, alcohol] = data.categories
    if (!psychoses || !alcohol) throw new Error('fixture')
    expect(tileMapCaption(psychoses)).toBe(
      'Psychoses: share of the category’s diagnosis codes that each state’s list includes',
    )
    expect(tileMapCaption(alcohol)).toBe(
      'Alcohol: each state’s share of the entries any state lists',
    )
  })
})
