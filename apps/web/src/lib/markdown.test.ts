import { describe, expect, it } from 'vitest'

import { parseMarkdown } from './markdown'

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
})
