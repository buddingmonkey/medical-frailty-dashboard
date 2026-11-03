import { describe, expect, it } from 'vitest'

import { SITEMAP_MAX_URLS, sitemapCodeFiles } from './sitemap'

describe('sitemapCodeFiles', () => {
  it('splits the code pages into files of at most 50,000 URLs', () => {
    expect(SITEMAP_MAX_URLS).toBe(50_000)
    expect(sitemapCodeFiles(0)).toBe(0)
    expect(sitemapCodeFiles(1)).toBe(1)
    expect(sitemapCodeFiles(50_000)).toBe(1)
    expect(sitemapCodeFiles(50_001)).toBe(2)
    // Every ICD-10-CM and HCPCS code there is would still fit in three files.
    expect(sitemapCodeFiles(107_173)).toBe(3)
  })
})
