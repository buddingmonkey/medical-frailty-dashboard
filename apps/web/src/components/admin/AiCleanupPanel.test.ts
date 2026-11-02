import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import type { ParseInput } from '../../ingest/parse'
import { server } from '../../test/msw-server'
import AiCleanupPanel from './AiCleanupPanel.vue'

const csv = (rows: number): ParseInput => ({
  kind: 'file',
  name: 'mt.csv',
  bytes: new TextEncoder().encode(
    ['Garbled', ...Array.from({ length: rows }, (_, i) => `F${String(i)} thing`)].join('\n'),
  ),
})

function setup(source: ParseInput, enabled = false) {
  const posts: unknown[] = []
  server.use(
    http.get('/api/admin/ai-cleanup', () =>
      HttpResponse.json({ enabled, model: enabled ? 'claude-opus-5-5' : null }),
    ),
    http.post('/api/admin/ai-cleanup', async ({ request }) => {
      posts.push(await request.json())
      return HttpResponse.json({
        text: '{"rows":[{"code":"F20.0","description":"Paranoid schizophrenia"}]}',
        model: 'claude-opus-5-5',
        usage: { inputTokens: 5000, outputTokens: 40 },
      })
    }),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rendered = render(AiCleanupPanel, {
    props: { stateId: 'MT', stateName: 'Montana', source },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  })
  return { user: userEvent.setup(), posts, emitted: () => rendered.emitted() }
}

describe('AiCleanupPanel', () => {
  it('builds the prompt for each part of the file', async () => {
    const { user } = setup(csv(4500))
    await user.click(screen.getByRole('button', { name: 'Prepare the prompt' }))
    // 4,501 lines: 46 "pages" of 100 lines, 2 parts of 40 pages.
    const part = await screen.findByLabelText<HTMLSelectElement>('Part')
    expect([...part.options].map((o) => o.textContent.trim())).toEqual([
      'Part 1 of 2 (pages 1–40)',
      'Part 2 of 2 (pages 41–46)',
    ])
    const prompt = screen.getByLabelText<HTMLTextAreaElement>('Prompt for part 1')
    expect(prompt.value).toContain('State: Montana. File: mt.csv. This is part 1 of 2')
    expect(prompt.value).toContain('Garbled')
    await user.selectOptions(part, '2')
    expect(screen.getByLabelText<HTMLTextAreaElement>('Prompt for part 2').value).toContain(
      'F4499 thing',
    )
  })

  it('reads a pasted answer as a table, and explains a bad one', async () => {
    const { user, emitted } = setup(csv(3))
    await user.click(screen.getByRole('button', { name: 'Prepare the prompt' }))
    const answer = await screen.findByLabelText('The assistant’s answer')
    await user.click(answer)
    await user.paste('Here you go!')
    await user.click(screen.getByRole('button', { name: 'Read the answer' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not JSON')

    await user.clear(answer)
    await user.click(answer)
    await user.paste('```json\n{"rows":[{"code":"F20.0"}]}\n```')
    await user.click(screen.getByRole('button', { name: 'Read the answer' }))
    const tables = emitted()['table'] as [{ name: string; rows: unknown[] }][]
    expect(tables[0]?.[0]).toMatchObject({
      name: 'mt.csv, AI part 1',
      rows: [{ locator: 'AI row 1' }],
    })
  })

  it('hides the Claude button while no API key is set', async () => {
    const off = setup(csv(3))
    await off.user.click(screen.getByRole('button', { name: 'Prepare the prompt' }))
    await screen.findByLabelText('Part')
    expect(screen.queryByRole('button', { name: /Ask Claude/ })).toBeNull()
  })

  it('asks Claude for a part and reads its answer', async () => {
    const { user, posts, emitted } = setup(csv(3), true)
    await user.click(screen.getByRole('button', { name: 'Prepare the prompt' }))
    await user.click(await screen.findByRole('button', { name: 'Ask Claude for part 1' }))
    expect(await screen.findByText(/Read 1 row from claude-opus-5-5/)).toBeTruthy()
    expect(posts).toEqual([
      {
        stateId: 'MT',
        fileName: 'mt.csv',
        part: expect.objectContaining({
          number: 1,
          count: 1,
          firstPage: 1,
          lastPage: 1,
        }) as unknown,
      },
    ])
    expect(emitted()['table']).toHaveLength(1)
  })
})
