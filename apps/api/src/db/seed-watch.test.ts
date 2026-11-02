import { watchListResponseSchema } from '@mfcd/shared'
import { describe, expect, it } from 'vitest'

import { accessToken, call } from '../test/access-fixtures'

// No resetDb here: this file checks what migration 0002 put in a fresh database.
describe('migration 0002_seed_watch_items', () => {
  it('seeds the watch dates from docs/status.md, all open and readable through the API', async () => {
    const res = await call('/api/admin/watch', { token: await accessToken() })
    const { items } = watchListResponseSchema.parse(await res.json())

    expect(items).toHaveLength(9)
    expect(items.every((i) => i.status === 'open' && i.createdBy === 'seed: docs/status.md')).toBe(
      true,
    )
    expect(items[0]).toMatchObject({
      title: 'Downgrade Cloudflare from Workers Paid to Free',
      dueDate: '2026-11-30',
    })
    expect(items.filter((i) => i.dueDate === null)).toHaveLength(3)
    expect(items.find((i) => i.kind === 'court')?.links[0]?.url).toMatch(/^https:\/\//)
  })
})
