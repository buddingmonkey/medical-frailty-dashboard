// HTML for server-rendered pages. Every interpolated value is escaped unless it is already an
// `Html` value built by this module, so database text can never become markup.

export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(text: string): string {
  let out = ''
  for (const ch of text) out += ESCAPES[ch] ?? ch
  return out
}

type Value = Html | string | number | null | undefined | false | readonly Html[]

function render(value: Value): string {
  if (value === null || value === undefined || value === false) return ''
  if (value instanceof Html) return value.value
  if (Array.isArray(value)) return value.map((v: Html) => v.value).join('')
  return escapeHtml(String(value))
}

/** Tagged template: `html\`<p>${text}</p>\``. */
export function html(strings: TemplateStringsArray, ...values: Value[]): Html {
  let out = strings[0] ?? ''
  values.forEach((v, i) => {
    out += render(v) + (strings[i + 1] ?? '')
  })
  return new Html(out)
}

/**
 * A JSON-LD block. `<`, `>` and `&` are written as JSON escapes, so no text in the data can close
 * the script element.
 */
export function jsonLdScript(data: unknown): Html {
  const json = JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
  return new Html(`<script type="application/ld+json">${json}</script>`)
}
