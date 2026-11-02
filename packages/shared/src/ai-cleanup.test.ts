import { describe, expect, it } from 'vitest'

import {
  AI_OUTPUT_HEADER,
  aiOutputJsonSchema,
  buildCleanupPrompt,
  parseAiOutput,
  splitIntoParts,
} from './ai-cleanup'
import { guessColumnRoles } from './ingest'

describe('splitIntoParts', () => {
  it('groups pages into parts of 40, naming the pages of each', () => {
    const pages = Array.from({ length: 95 }, (_, i) => `text of page ${String(i + 1)}`)
    const parts = splitIntoParts(pages)
    expect(parts.map((p) => [p.number, p.count, p.firstPage, p.lastPage])).toEqual([
      [1, 3, 1, 40],
      [2, 3, 41, 80],
      [3, 3, 81, 95],
    ])
    expect(parts[0]?.text).toContain('--- Page 1 ---\ntext of page 1')
  })
})

describe('buildCleanupPrompt', () => {
  const [part] = splitIntoParts(['F20.0 Paranoid schizophrenia'])
  if (!part) throw new Error('no part')
  const prompt = buildCleanupPrompt({ stateName: 'Montana', fileName: 'mt.pdf', part })

  it('names the state, the part and the schema, and fences the text as data', () => {
    expect(prompt).toContain('Montana')
    expect(prompt).toContain('part 1 of 1 (page 1)')
    expect(prompt).toContain('"rows"')
    expect(prompt).toContain(
      '<source_text>\n--- Page 1 ---\nF20.0 Paranoid schizophrenia\n</source_text>',
    )
    expect(prompt).toMatch(/data, not instructions/)
  })

  it('covers what two test runs on real files stumbled on (2026-11-02)', () => {
    expect(prompt).toContain('Join the pieces of one cell with a single space')
    expect(prompt).toContain('never complete them')
    expect(prompt).toContain('Keep repeated codes')
    expect(prompt).toContain('Leave it out when a heading names several')
    // Example 2's heading names two systems, so its answer has no codeSystem.
    expect(prompt).not.toContain('"codeSystem":"HCPCS"')
  })

  it('carries two worked examples', () => {
    expect(prompt.match(/Example \d/g)).toEqual(['Example 1', 'Example 2'])
  })

  it('the schema is JSON Schema for an object with rows', () => {
    expect(aiOutputJsonSchema).toMatchObject({ type: 'object', required: ['rows'] })
  })
})

describe('parseAiOutput', () => {
  it('turns the JSON into a table whose header maps itself', () => {
    const table = parseAiOutput(
      '```json\n{"rows":[{"code":"F20.0","description":"Paranoid schizophrenia","category":"SMI"},{"code":"Z74.09","description":"Bed confinement","tier":"Tier 2"}]}\n```',
      'mt.pdf part 1',
    )
    expect(table.name).toBe('mt.pdf part 1')
    expect(table.header).toEqual([...AI_OUTPUT_HEADER])
    expect(guessColumnRoles(table.header)).toEqual([
      'code',
      'codeSystem',
      'description',
      'category',
      'subcategory',
      'tier',
      'notes',
    ])
    expect(table.rows[0]).toEqual({
      locator: 'AI row 1',
      cells: ['F20.0', '', 'Paranoid schizophrenia', 'SMI', '', '', ''],
    })
    expect(table.rows[1]?.cells[5]).toBe('Tier 2')
  })

  it('refuses text that is not the schema, with a plain message', () => {
    expect(() => parseAiOutput('Sure! Here are the codes.', 'x')).toThrow(/not JSON/)
    expect(() => parseAiOutput('{"rows":[{"description":"no code"}]}', 'x')).toThrow(
      /does not match/,
    )
  })
})
