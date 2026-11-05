import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import MarkdownView from './MarkdownView.vue'

// Markdown as text nodes (the parser is packages/shared/src/markdown.ts). The Worker's HTML for a
// state's notes (apps/api/src/seo/pages.ts) writes the same elements and link attributes.

describe('MarkdownView', () => {
  it('renders bold, links and lists, and markup as text', () => {
    const { container } = render(MarkdownView, {
      props: {
        source:
          'Georgia has **two** lists. See [the PDF](https://example.org/a.pdf) or [codes](/codes).\n\n' +
          '- first\n- <script>alert(1)</script>\n',
      },
    })

    expect(screen.getByText('two').tagName).toBe('STRONG')
    const external = screen.getByRole('link', { name: 'the PDF' })
    expect(external.getAttribute('href')).toBe('https://example.org/a.pdf')
    expect(external.getAttribute('rel')).toBe('noopener noreferrer external')
    const local = screen.getByRole('link', { name: 'codes' })
    expect(local.getAttribute('href')).toBe('/codes')
    expect(local.hasAttribute('rel')).toBe(false)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy()
    expect(container.querySelector('script')).toBeNull()
  })

  it('drops a protocol-relative link to its text', () => {
    render(MarkdownView, { props: { source: 'Go [there](//evil.example).' } })
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Go there.')).toBeTruthy()
  })
})
