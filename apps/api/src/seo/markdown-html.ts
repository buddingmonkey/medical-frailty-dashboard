import { type MarkdownBlock, type MarkdownInline, parseMarkdown } from '@mfcd/shared'

import { Html, html } from './html'
import { linkHtml } from './info-page'

// Markdown (a state's notes) as HTML for the server-rendered pages: the same parser and the same
// elements as the Vue `MarkdownView` (packages/shared/src/markdown.ts). Every text node goes
// through `html`, so it is escaped; the parser keeps only https and same-site links.

function inlineHtml(parts: readonly MarkdownInline[]): Html[] {
  return parts.map((part) => {
    switch (part.type) {
      case 'code':
        return html`<code>${part.text}</code>`
      case 'bold':
        return html`<strong>${part.text}</strong>`
      case 'link':
        return linkHtml({ text: part.text, href: part.href })
      case 'text':
        return html`${part.text}`
    }
  })
}

function blockHtml(block: MarkdownBlock, shift: number): Html {
  switch (block.type) {
    case 'heading': {
      // The level is a number from the parser (1–6), never text from the source.
      const tag = `h${String(Math.min(block.level + shift, 6))}`
      return new Html(`<${tag}>${html`${inlineHtml(block.text)}`.value}</${tag}>`)
    }
    case 'paragraph':
      return html`<p>${inlineHtml(block.text)}</p>`
    case 'list': {
      const items = block.items.map((item) => html`<li>${inlineHtml(item)}</li>`)
      return block.ordered
        ? html`<ol>
            ${items}
          </ol>`
        : html`<ul>
            ${items}
          </ul>`
    }
    case 'code':
      return html`<pre><code>${block.text}</code></pre>`
  }
}

/** Markdown as HTML. Headings move down `shift` levels, as `MarkdownView`'s `shift` prop does. */
export function markdownHtml(source: string, shift = 1): Html[] {
  return parseMarkdown(source).map((block) => blockHtml(block, shift))
}
