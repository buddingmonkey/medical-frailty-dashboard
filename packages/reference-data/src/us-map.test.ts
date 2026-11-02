import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { buildUsMap, readUsAtlas, US_MAP_FILE, usMapJson } from './us-map.ts'

describe('US map shapes', () => {
  it('has the 50 states and DC, no territories', () => {
    const map = buildUsMap(readUsAtlas())
    expect(map.states).toHaveLength(51)
    const fips = map.states.map((s) => s.fips)
    expect(fips).toContain('11')
    expect(fips.some((f) => Number(f) > 56)).toBe(false)
    const ga = map.states.find((s) => s.fips === '13')
    expect(ga?.name).toBe('Georgia')
    expect(ga?.id).toBe('GA')
    expect(ga?.cx).toBeGreaterThan(600)
  })

  it('matches the committed packages/shared/src/us-map.json (run `pnpm --filter @mfcd/reference-data us-map`)', () => {
    expect(readFileSync(US_MAP_FILE, 'utf8')).toBe(usMapJson())
  })
})
