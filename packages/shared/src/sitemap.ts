// The sitemap's limits (roadmap M6 step 5; docs/seo.md, "Sitemap and robots.txt"). The protocol
// allows 50,000 URLs and 50 MB (uncompressed) per file; a code page's entry is about 110 bytes,
// so 50,000 of them is about 5.5 MB and the URL count is the limit that matters.

export const SITEMAP_MAX_URLS = 50_000

/** How many code sitemap files `/sitemap.xml` lists for this many included codes. */
export const sitemapCodeFiles = (codes: number): number => Math.ceil(codes / SITEMAP_MAX_URLS)
