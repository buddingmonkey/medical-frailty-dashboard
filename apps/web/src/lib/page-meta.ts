import { SHARE_IMAGE } from '@mfcd/shared'
import { type MaybeRefOrGetter, toValue, watchEffect } from 'vue'

export interface PageMeta {
  title: string
  description: string
}

/** The `<meta>` with this attribute, created at the end of <head> when index.html has none. */
function metaTag(key: 'name' | 'property', name: string): HTMLMetaElement {
  const found = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${name}"]`)
  if (found) return found
  const el = document.createElement('meta')
  el.setAttribute(key, name)
  document.head.append(el)
  return el
}

/**
 * Keeps the title, description, Open Graph and Twitter tags in step with the page, using the
 * same words the Worker puts in the server-rendered HTML (`pageTitles`, `pageDescriptions` and
 * the other shared helpers in packages/shared; docs/seo.md). `null` while the page's data
 * loads: the head keeps what it had. Crawlers read the Worker's tags; these keep a link copied
 * after moving between pages honest.
 */
export function usePageMeta(meta: MaybeRefOrGetter<PageMeta | null>) {
  watchEffect(() => {
    const value = toValue(meta)
    if (value === null) return
    const { origin, pathname } = window.location
    document.title = value.title
    metaTag('name', 'description').content = value.description
    metaTag('property', 'og:type').content = 'website'
    metaTag('property', 'og:title').content = value.title
    metaTag('property', 'og:description').content = value.description
    metaTag('property', 'og:url').content = `${origin}${pathname}`
    metaTag('property', 'og:image').content = `${origin}${SHARE_IMAGE.path}`
    metaTag('name', 'twitter:card').content = 'summary_large_image'
  })
}
