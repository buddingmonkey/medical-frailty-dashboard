// A small Markdown reader for our own docs shown in the admin (docs/add-state-source.md at
// /admin/guide). It returns a tree that a component renders as text nodes, so nothing is ever
// inserted as HTML. Supports what those docs use: headings, paragraphs, lists, fenced code,
// inline code, bold and links. Linear scans only (no backtracking regexes).

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'link'; text: string; href: string }

export type Block =
  | { type: 'heading'; level: number; text: Inline[] }
  | { type: 'paragraph'; text: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string }

/**
 * An https link or a path on this site. Browsers read `\` as `/` and drop tabs and newlines, so
 * a href with a backslash, whitespace or control character is refused, and `//host` (another
 * site, protocol-relative) is not a path.
 */
function safeHref(href: string): boolean {
  if (/[\\\s\p{Cc}]/u.test(href)) return false
  if (href.startsWith('https://')) return true
  return href.startsWith('/') && !href.startsWith('//')
}

function pushText(out: Inline[], text: string) {
  if (text === '') return
  const last = out.at(-1)
  if (last?.type === 'text') last.text += text
  else out.push({ type: 'text', text })
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let i = 0
  let plain = ''
  const flush = () => {
    pushText(out, plain)
    plain = ''
  }
  while (i < text.length) {
    const ch = text[i] ?? ''
    if (ch === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i) {
        flush()
        out.push({ type: 'code', text: text.slice(i + 1, end) })
        i = end + 1
        continue
      }
    } else if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > i + 1) {
        flush()
        out.push({ type: 'bold', text: text.slice(i + 2, end) })
        i = end + 2
        continue
      }
    } else if (ch === '[') {
      const close = text.indexOf('](', i + 1)
      const end = close > i ? text.indexOf(')', close + 2) : -1
      if (close > i && end > close) {
        flush()
        const label = text.slice(i + 1, close)
        const href = text.slice(close + 2, end)
        if (safeHref(href)) out.push({ type: 'link', text: label, href })
        else pushText(out, label)
        i = end + 1
        continue
      }
    }
    plain += ch
    i++
  }
  flush()
  return out
}

const headingLevel = (line: string) => {
  let n = 0
  while (line[n] === '#') n++
  return n > 0 && n <= 6 && line[n] === ' ' ? n : 0
}

/** `- item` or `1. item`: the marker's kind and the item text, or null. */
function listItem(line: string): { ordered: boolean; text: string } | null {
  if (line.startsWith('- ')) return { ordered: false, text: line.slice(2) }
  let n = 0
  while (n < line.length && '0123456789'.includes(line.charAt(n))) n++
  if (n > 0 && line.startsWith('. ', n)) return { ordered: true, text: line.slice(n + 2) }
  return null
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    if (trimmed === '') {
      i++
      continue
    }
    if (trimmed.startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```'))
        body.push(lines[i++] ?? '')
      i++
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    const level = headingLevel(line)
    if (level > 0) {
      blocks.push({ type: 'heading', level, text: parseInline(line.slice(level + 1).trim()) })
      i++
      continue
    }
    const first = listItem(line)
    if (first) {
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        const item = listItem(current)
        if (item?.ordered === first.ordered) items.push(item.text.trim())
        else if (current.startsWith('  ') && current.trim() !== '' && items.length > 0) {
          items.push(`${items.pop() ?? ''} ${current.trim()}`)
        } else break
        i++
      }
      blocks.push({ type: 'list', ordered: first.ordered, items: items.map(parseInline) })
      continue
    }
    const para: string[] = []
    while (i < lines.length) {
      const current = lines[i] ?? ''
      if (
        current.trim() === '' ||
        headingLevel(current) > 0 ||
        listItem(current) ||
        current.trim().startsWith('```')
      )
        break
      para.push(current.trim())
      i++
    }
    blocks.push({ type: 'paragraph', text: parseInline(para.join(' ')) })
  }
  return blocks
}
