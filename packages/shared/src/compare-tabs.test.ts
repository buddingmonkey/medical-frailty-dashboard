import { describe, expect, it } from 'vitest'

import { compareTabMark, compareTabs } from './compare-tabs'
import { isReservedUnifiedSlug } from './unified'

// The tab row on every /compare page: one list for the Vue component and the Worker's HTML.

describe('compare tabs', () => {
  it('lists the views in order', () => {
    expect(compareTabs.map((t) => [t.label, t.path])).toEqual([
      ['Overview', '/compare'],
      ['Categories', '/compare/categories'],
      ['Map', '/compare/map'],
      ['Overlaps', '/compare/overlaps'],
      ['States side by side', '/compare/states'],
      ['Single codes', '/compare/codes'],
    ])
  })

  it('reserves every tab path as a unified slug, so no category takes it', () => {
    for (const tab of compareTabs.slice(1)) {
      expect(isReservedUnifiedSlug(tab.path.replace('/compare/', ''))).toBe(true)
    }
  })

  const marks = (path: string) =>
    Object.fromEntries(
      compareTabs.flatMap((t) => {
        const mark = compareTabMark(t.path, path)
        return mark === null ? [] : [[t.label, mark]]
      }),
    )

  it('marks the page itself', () => {
    expect(marks('/compare')).toEqual({ Overview: 'page' })
    expect(marks('/compare/categories')).toEqual({ Categories: 'page' })
    expect(marks('/compare/map')).toEqual({ Map: 'page' })
    expect(marks('/compare/overlaps')).toEqual({ Overlaps: 'page' })
    expect(marks('/compare/states')).toEqual({ 'States side by side': 'page' })
    expect(marks('/compare/codes')).toEqual({ 'Single codes': 'page' })
    expect(marks('/compare/map/')).toEqual({ Map: 'page' })
  })

  it('marks the parent of a deeper page', () => {
    expect(marks('/compare/kidney-failure')).toEqual({ Categories: 'true' })
    expect(marks('/compare/states/ga-vs-mt')).toEqual({ 'States side by side': 'true' })
  })

  it('marks nothing outside the compare pages', () => {
    expect(marks('/')).toEqual({})
    expect(marks('/states/ga')).toEqual({})
    expect(marks('/compare/kidney-failure/codes.csv')).toEqual({})
    expect(marks('/compared')).toEqual({})
  })
})

describe('compareTabMark on unusual paths', () => {
  it('ignores trailing slashes', () => {
    expect(compareTabMark('/compare', '/compare///')).toBe('page')
    expect(compareTabMark('/compare/categories', '/compare/cancer/')).toBe('true')
  })

  it('answers quickly for a path of many slashes (no regex backtracking; CodeQL)', () => {
    const path = `/compare${'/'.repeat(100_000)}x`
    const started = performance.now()
    expect(compareTabMark('/compare', path)).toBeNull()
    expect(performance.now() - started).toBeLessThan(50)
  })
})
