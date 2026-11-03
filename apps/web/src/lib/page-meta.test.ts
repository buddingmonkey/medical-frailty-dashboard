import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { SHARE_IMAGE, SITE_ICONS, THEME_COLORS } from '@mfcd/shared'
import { render } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'

import { usePageMeta } from './page-meta'

// The browser's head handling (roadmap M8 step 4; docs/seo.md): the same title, description and
// Open Graph tags the Worker writes, kept in step as the visitor moves between pages.

const meta = (selector: string) =>
  document.head.querySelector<HTMLMetaElement>(`meta[${selector}]`)?.content ?? null

function mount(value: () => { title: string; description: string } | null) {
  return render(
    defineComponent({
      setup() {
        usePageMeta(value)
        return () => h('p', 'page')
      },
    }),
  )
}

beforeEach(() => {
  document.head.innerHTML = '<meta name="description" content="Default." />'
  document.title = 'Default'
})

afterEach(() => {
  document.head.innerHTML = ''
})

describe('usePageMeta', () => {
  it('sets the title, description, Open Graph and Twitter tags, with absolute URLs', async () => {
    mount(() => ({ title: 'Georgia | Site', description: 'Georgia’s list.' }))
    await nextTick()

    expect(document.title).toBe('Georgia | Site')
    expect(meta('name="description"')).toBe('Georgia’s list.')
    expect(meta('property="og:title"')).toBe('Georgia | Site')
    expect(meta('property="og:description"')).toBe('Georgia’s list.')
    expect(meta('property="og:type"')).toBe('website')
    expect(meta('property="og:url"')).toBe(`${location.origin}${location.pathname}`)
    expect(meta('property="og:image"')).toBe(`${location.origin}${SHARE_IMAGE.path}`)
    expect(meta('name="twitter:card"')).toBe('summary_large_image')
    // One of each, the description updated in place.
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
  })

  it('follows the page as its data changes, and leaves the head alone while it loads', async () => {
    const value = ref<{ title: string; description: string } | null>(null)
    mount(() => value.value)
    await nextTick()
    expect(document.title).toBe('Default')
    expect(meta('name="description"')).toBe('Default.')

    value.value = { title: 'Montana | Site', description: 'Montana’s list.' }
    await nextTick()
    expect(document.title).toBe('Montana | Site')
    expect(meta('property="og:description"')).toBe('Montana’s list.')
  })
})

describe('index.html', () => {
  const indexHtml = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8')

  it('links the icons, manifest and theme colours from packages/shared', () => {
    expect(indexHtml).toContain(`<link rel="icon" href="${SITE_ICONS.svg}" type="image/svg+xml" />`)
    expect(indexHtml).toContain(
      `<link rel="icon" href="${SITE_ICONS.png32}" type="image/png" sizes="32x32" />`,
    )
    expect(indexHtml).toContain(`<link rel="apple-touch-icon" href="${SITE_ICONS.appleTouch}" />`)
    expect(indexHtml).toContain(`<link rel="manifest" href="${SITE_ICONS.manifest}" />`)
    expect(indexHtml).toContain(
      `<meta name="theme-color" content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)" />`,
    )
    expect(indexHtml).toContain(
      `<meta name="theme-color" content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)" />`,
    )
  })

  it('has no inline script or style (the CSP allows neither)', () => {
    expect(indexHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    expect(indexHtml).not.toMatch(/<style|style="/)
  })
})

describe('every page sets its title', () => {
  const pagesDir = join(import.meta.dirname, '..', 'pages')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? files(path) : path.endsWith('.vue') ? [path] : []
    })

  // Public pages set a title and description (usePageMeta, or InfoPageView for About and the
  // other fixed-text pages); the admin layout sets one title for every admin page.
  it.each(files(pagesDir).map((path) => relative(pagesDir, path)))('%s', (file) => {
    if (file.startsWith('admin/')) return
    const source = readFileSync(join(pagesDir, file), 'utf8')
    expect(source).toMatch(/usePageMeta\(|<InfoPageView\b/)
  })
})
