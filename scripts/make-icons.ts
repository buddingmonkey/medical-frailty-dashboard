// `node scripts/make-icons.ts`: writes the site's icons, web manifest and share image into
// apps/web/public (roadmap M8 step 4, "Professional site basics"; docs/seo.md, "Icons and share
// image"). The generated files are committed, so builds never need this script or `sharp`.
// Run it again only after changing the mark, the colours or the wording below.
//
// The mark is our own (not a CCF logo): a navy rounded square with a three-line list, each line
// with a gold bullet. Colours are the design tokens in apps/web/src/styles/main.css (the test
// checks they still match). Runs directly on Node 26 (type stripping).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Token values from main.css: --color-primary (light), --color-header (dark), --color-highlight. */
export const COLORS = {
  navy: '#0c2a59',
  navyDark: '#031b3f',
  gold: '#f7c343',
  white: '#ffffff',
  lightBlue: '#9cc3f0',
} as const

export const SITE_NAME = 'Medical Frailty Coding Dashboard'
export const SHORT_NAME = 'Frailty Codes'
export const TAGLINE =
  'Compare the code lists US states use to mark Medicaid members as medically frail.'

/** The mark's shapes on a 32-unit grid, without the <svg> wrapper (reused in the share image). */
function markShapes(): string {
  const rows = [7, 14, 21]
  return [
    `<rect width="32" height="32" rx="7" fill="${COLORS.navy}"/>`,
    ...rows.map(
      (y) =>
        `<rect x="6" y="${String(y)}" width="4" height="4" rx="1" fill="${COLORS.gold}"/>` +
        `<rect x="12" y="${String(y)}" width="14" height="4" rx="1" fill="${COLORS.white}"/>`,
    ),
  ].join('')
}

/** apps/web/public/favicon.svg. No <style>, so it renders the same under any CSP. */
export function markSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<title>${SITE_NAME}</title>${markShapes()}</svg>\n`
  )
}

/** The 1200×630 Open Graph / Twitter image: the mark, the site name and the tagline. */
export function shareSvg(): string {
  const font = `'Source Sans 3', 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif`
  // The tagline on two lines, split at a word boundary near the middle.
  const words = TAGLINE.split(' ')
  const half = Math.ceil(words.length / 2)
  const lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')]
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<rect width="1200" height="630" fill="${COLORS.navy}"/>` +
    `<rect y="600" width="1200" height="30" fill="${COLORS.gold}"/>` +
    `<g transform="translate(96 96) scale(4.5)">${markShapes()}` +
    `<rect width="32" height="32" rx="7" fill="none" stroke="${COLORS.white}" stroke-width="0.4"/></g>` +
    `<text x="96" y="340" font-family="${font}" font-size="76" font-weight="700" fill="${COLORS.white}">Medical Frailty</text>` +
    `<text x="96" y="428" font-family="${font}" font-size="76" font-weight="700" fill="${COLORS.white}">Coding Dashboard</text>` +
    lines
      .map(
        (line, i) =>
          `<text x="96" y="${String(500 + i * 46)}" font-family="${font}" font-size="36" fill="${COLORS.lightBlue}">${line}</text>`,
      )
      .join('') +
    `</svg>\n`
  )
}

export interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

/** apps/web/public/site.webmanifest. `display: browser`: the site is a set of linked pages. */
export function manifest(): string {
  const icons: ManifestIcon[] = [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
  ]
  return (
    JSON.stringify(
      {
        name: SITE_NAME,
        short_name: SHORT_NAME,
        description: TAGLINE,
        start_url: '/',
        scope: '/',
        display: 'browser',
        theme_color: COLORS.navy,
        background_color: COLORS.white,
        icons,
      },
      null,
      2,
    ) + '\n'
  )
}

/** Each PNG: its file name and size in pixels (square), from the mark. */
export const PNG_ICONS = [
  { file: 'favicon-32.png', size: 32 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
] as const

export const SHARE_IMAGE_FILE = 'og-image.png'

async function main() {
  const { default: sharp } = await import('sharp')
  const out = join(import.meta.dirname, '..', 'apps', 'web', 'public')
  const mark = Buffer.from(markSvg())
  writeFileSync(join(out, 'favicon.svg'), markSvg())
  writeFileSync(join(out, 'site.webmanifest'), manifest())
  for (const { file, size } of PNG_ICONS) {
    // The Apple icon gets a full square: iOS rounds the corners itself and would show white
    // where the mark's corners are transparent.
    const svg =
      file === 'apple-touch-icon.png' ? Buffer.from(markSvg().replace(' rx="7"', '')) : mark
    await sharp(svg, { density: (72 * size) / 32 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(join(out, file))
  }
  await sharp(Buffer.from(shareSvg()))
    .png({ compressionLevel: 9 })
    .toFile(join(out, SHARE_IMAGE_FILE))
  console.log(
    `Wrote favicon.svg, site.webmanifest, ${String(PNG_ICONS.length)} icons and ${SHARE_IMAGE_FILE}.`,
  )
}

if (import.meta.main) await main()
