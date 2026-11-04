// `node scripts/make-icons.ts`: writes the site's icons, web manifest and share image into
// apps/web/public (roadmap M8 step 4, "Professional site basics"; docs/seo.md, "Icons and share
// image"). The generated files are committed, so builds never need this script or `sharp`.
// Run it again only after changing the mark, the colours or the wording below.
//
// The mark is our own (not a CCF logo; drawn 2026-11-04 from an image the project lead made):
// two list cards side by side, overlapping; the overlap is gold with a white check, for the
// codes both lists share. favicon.svg and favicon-32.png use a simpler version (two thick list
// lines per card on the 16 px pixel grid, a thicker check) that still reads at 16 px. The header
// logo (logo-header.svg) adds a white outline so the navy card shows on the navy header. Colours
// are the design tokens in apps/web/src/styles/main.css (the test checks they still match). Runs directly on Node 26 (type stripping).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Token values from main.css: --color-primary (light), --color-header (dark), --color-highlight. */
export const COLORS = {
  navy: '#0c2a59',
  navyDark: '#031b3f',
  gold: '#f7c343',
  white: '#ffffff',
  lightBlue: '#9cc3f0',
  /** The right-hand card. Not a token: the mark's own colour. */
  steel: '#3f6fa3',
} as const

export const SITE_NAME = 'Medical Frailty Coding Dashboard'
export const SHORT_NAME = 'Frailty Codes'
export const TAGLINE =
  'Compare the code lists US states use to mark Medicaid members as medically frail.'

/**
 * The mark's shapes, in the coordinates of the source image (1932 px square), without the <svg>
 * wrapper (reused in the share image). `simple` uses fewer, thicker list lines and a thicker check.
 */
function markShapes(simple = false): string {
  const bar = (x: number, y: number, w = 237, h = 60, rx = 12) =>
    `<rect x="${String(x)}" y="${String(y)}" width="${String(w)}" height="${String(h)}" rx="${String(rx)}" fill="${COLORS.white}"/>`
  // Simple: each line is one pixel tall at 16 px (83 units) and sits on that pixel grid
  // (origin 301), so it stays sharp at 16 and 32 px.
  const lines = simple
    ? [467, 633].map((y) => bar(467, y, 249, 83, 20)).join('') +
      [633, 799].map((y) => bar(1215, y, 250, 83, 20)).join('')
    : [448, 557].map((y) => bar(439, y)).join('') +
      [581, 690, 800].map((y) => bar(1256, y)).join('')
  const check = simple
    ? `<path d="M836 968 L928 1062 L1096 886" fill="none" stroke="${COLORS.white}" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M851 978 L920 1049 L1080 882" fill="none" stroke="${COLORS.white}" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/>`
  return (
    `<rect x="343" y="322" width="816" height="1126" rx="78" fill="${COLORS.navy}"/>` +
    `<rect x="773" y="483" width="817" height="1127" rx="78" fill="${COLORS.steel}"/>` +
    // The overlap: rounded where the right card's top-left and the left card's bottom-right are.
    `<path d="M851 483 H1159 V1370 A78 78 0 0 1 1081 1448 H773 V561 A78 78 0 0 1 851 483 Z" fill="${COLORS.gold}"/>` +
    lines +
    check
  )
}

/** The mark's square frame inside the source image's coordinates. */
const MARK_VIEWBOX = '301 301 1330 1330'

/** The mark (app icons). Transparent background. */
export function markSvg(simple = false): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">` +
    `<title>${SITE_NAME}</title>${markShapes(simple)}</svg>\n`
  )
}

/** apps/web/public/favicon.svg: the simple mark. No <style>, so it renders the same under any CSP. */
export const faviconSvg = (): string => markSvg(true)

/**
 * apps/web/public/logo-header.svg: the simple mark with a white outline around both cards, so
 * the navy card shows on the navy header (App.vue). A wider frame leaves room for the outline.
 */
export function headerLogoSvg(): string {
  const outline = (x: number, y: number) =>
    `<rect x="${String(x)}" y="${String(y)}" width="817" height="1127" rx="78" fill="${COLORS.white}" stroke="${COLORS.white}" stroke-width="88"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="251 251 1430 1430">` +
    `${outline(343, 322)}${outline(773, 483)}${markShapes(true)}</svg>\n`
  )
}

/** The Apple icon: the full mark on a white square (iOS rounds the corners itself). */
export function appleSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="141 141 1650 1650">` +
    `<rect x="141" y="141" width="1650" height="1650" fill="${COLORS.white}"/>${markShapes()}</svg>\n`
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
    `<rect width="1200" height="630" fill="${COLORS.white}"/>` +
    `<rect y="600" width="1200" height="30" fill="${COLORS.gold}"/>` +
    // The mark at 180 px, top left (1330 source units to 180 px).
    `<g transform="translate(96 80) scale(${String(180 / 1330)}) translate(-301 -301)">${markShapes()}</g>` +
    `<text x="96" y="340" font-family="${font}" font-size="76" font-weight="700" fill="${COLORS.navy}">Medical Frailty</text>` +
    `<text x="96" y="428" font-family="${font}" font-size="76" font-weight="700" fill="${COLORS.navy}">Coding Dashboard</text>` +
    lines
      .map(
        (line, i) =>
          `<text x="96" y="${String(500 + i * 46)}" font-family="${font}" font-size="36" fill="#5c5c5c">${line}</text>`,
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
  writeFileSync(join(out, 'favicon.svg'), faviconSvg())
  writeFileSync(join(out, 'logo-header.svg'), headerLogoSvg())
  writeFileSync(join(out, 'site.webmanifest'), manifest())
  for (const { file, size } of PNG_ICONS) {
    // Small sizes use the simple mark; the Apple icon gets a white square behind the mark.
    const svg = file === 'apple-touch-icon.png' ? appleSvg() : markSvg(size <= 32)
    await sharp(Buffer.from(svg), { density: (72 * size) / 1330 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(join(out, file))
  }
  await sharp(Buffer.from(shareSvg()))
    .png({ compressionLevel: 9 })
    .toFile(join(out, SHARE_IMAGE_FILE))
  console.log(
    `Wrote favicon.svg, logo-header.svg, site.webmanifest, ${String(PNG_ICONS.length)} icons and ${SHARE_IMAGE_FILE}.`,
  )
}

if (import.meta.main) await main()
