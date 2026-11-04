import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  COLORS,
  headerLogoSvg,
  faviconSvg,
  manifest,
  markSvg,
  PNG_ICONS,
  SHARE_IMAGE_FILE,
  SITE_NAME,
} from './make-icons.ts'

// The committed icons, manifest and share image (roadmap M8 step 4) match the generator and the
// design tokens. Rerun `node scripts/make-icons.ts` when one of these fails.

const root = join(import.meta.dirname, '..')
const publicDir = join(root, 'apps', 'web', 'public')
const read = (file: string) => readFileSync(join(publicDir, file))

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buf = read(file)
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('site icons and share image', () => {
  it('commits the favicon and manifest the generator writes', () => {
    expect(read('favicon.svg').toString('utf8')).toBe(faviconSvg())
    expect(read('logo-header.svg').toString('utf8')).toBe(headerLogoSvg())
    expect(read('site.webmanifest').toString('utf8')).toBe(manifest())
  })

  it('uses the design-token colours', () => {
    const css = readFileSync(join(root, 'apps', 'web', 'src', 'styles', 'main.css'), 'utf8')
    expect(css).toContain(`--color-primary: ${COLORS.navy};`)
    expect(css).toContain(`--color-header: ${COLORS.navyDark};`)
    expect(css).toContain(`--color-highlight: ${COLORS.gold};`)
    expect(css).toContain(`--color-link: ${COLORS.lightBlue};`)
  })

  it('names the site, with no CCF name, and lists the PNG icons in the manifest', () => {
    const m = JSON.parse(manifest()) as { name: string; icons: { src: string }[] }
    expect(m.name).toBe(SITE_NAME)
    expect(markSvg() + manifest()).not.toMatch(/CCF|Georgetown/i)
    expect(m.icons.map((i) => i.src)).toEqual(['/icon-192.png', '/icon-512.png', '/favicon.svg'])
  })

  it.each(PNG_ICONS)('$file is a $size px square PNG', ({ file, size }) => {
    expect(pngSize(file)).toEqual({ width: size, height: size })
  })

  it('the share image is a 1200×630 PNG', () => {
    expect(pngSize(SHARE_IMAGE_FILE)).toEqual({ width: 1200, height: 630 })
  })
})
