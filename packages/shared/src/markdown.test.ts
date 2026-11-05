import { describe, expect, it } from 'vitest'

import { parseInline, parseMarkdown, safeMarkdownHref } from './markdown'

describe('parseMarkdown', () => {
  it('reads headings, paragraphs joined across lines, and lists', () => {
    const md =
      '# Title\n\nOne line\nand the next.\n\n## Part\n\n- first\n  wrapped\n- second\n\n1. one\n2. two\n'
    expect(parseMarkdown(md)).toEqual([
      { type: 'heading', level: 1, text: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', text: [{ type: 'text', text: 'One line and the next.' }] },
      { type: 'heading', level: 2, text: [{ type: 'text', text: 'Part' }] },
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'text', text: 'first wrapped' }], [{ type: 'text', text: 'second' }]],
      },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'one' }], [{ type: 'text', text: 'two' }]],
      },
    ])
  })

  it('keeps fenced code as it is', () => {
    expect(parseMarkdown('```\nRead CLAUDE.md\n  indented\n```\n')).toEqual([
      { type: 'code', text: 'Read CLAUDE.md\n  indented' },
    ])
  })

  it('reads inline code, bold and links, and never a script link', () => {
    const [p] = parseMarkdown(
      'Use **Save** and `F20` on [the site](https://example.org) or [bad](javascript:alert(1)).',
    )
    expect(p).toEqual({
      type: 'paragraph',
      text: [
        { type: 'text', text: 'Use ' },
        { type: 'bold', text: 'Save' },
        { type: 'text', text: ' and ' },
        { type: 'code', text: 'F20' },
        { type: 'text', text: ' on ' },
        { type: 'link', text: 'the site', href: 'https://example.org' },
        // The script link becomes plain text (its own ")" stays as text).
        { type: 'text', text: ' or bad).' },
      ],
    })
  })

  it('keeps site paths as links but not protocol-relative or backslash ones', () => {
    const hrefs = [
      '/admin/guide',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      '/\\/x',
      '/\t/evil.example',
    ]
    const links = hrefs.map((href) => parseInline(`[x](${href})`)[0])
    expect(links).toEqual([
      { type: 'link', text: 'x', href: '/admin/guide' },
      { type: 'text', text: 'x' },
      { type: 'text', text: 'x' },
      { type: 'text', text: 'x' },
      { type: 'text', text: 'x' },
      { type: 'text', text: 'x' },
    ])
  })

  it('keeps same-site links and drops protocol-relative ones', () => {
    expect(parseInline('[ok](/states/ga) [bad](//evil.example)')).toEqual([
      { type: 'link', text: 'ok', href: '/states/ga' },
      { type: 'text', text: ' bad' },
    ])
  })
})

describe('safeMarkdownHref', () => {
  it('allows https and same-site paths', () => {
    expect(safeMarkdownHref('https://example.org/a')).toBe(true)
    expect(safeMarkdownHref('/states/ga')).toBe(true)
    expect(safeMarkdownHref('/')).toBe(true)
  })

  it('rejects other schemes', () => {
    for (const href of [
      'http://example.org',
      'javascript:alert(1)',
      'data:text/html,x',
      'mailto:a',
    ]) {
      expect(safeMarkdownHref(href)).toBe(false)
    }
  })

  it('rejects protocol-relative URLs, backslash variants and hidden whitespace', () => {
    // Browsers read `\` as `/` and drop tabs and newlines, so each of these leaves the site.
    for (const href of [
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      '\\/evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      ' //evil.example',
      'https://ok.example/ x',
    ]) {
      expect(safeMarkdownHref(href)).toBe(false)
    }
  })
})
