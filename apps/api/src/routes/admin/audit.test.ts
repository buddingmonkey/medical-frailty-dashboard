import { auditListResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { auditInsert } from '../../db/audit'
import { createDb } from '../../db/client'
import { accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

const db = createDb(env.DB)

async function list(query = '') {
  return call(`/api/admin/audit${query}`, { token: await accessToken() })
}

describe('GET /api/admin/audit', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
  })

  it('lists actions newest first, with details parsed and never cached', async () => {
    await auditInsert(db, {
      actorEmail: 'admin@example.org',
      action: 'source.upload',
      target: 'state:MT',
      details: { file: 'mt.pdf' },
    })
    await auditInsert(db, {
      actorEmail: 'admin@example.org',
      action: 'watch.close',
      target: 'watch:1',
    })

    const res = await list()

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = auditListResponseSchema.parse(await res.json())
    expect(body.items.map((i) => i.action)).toEqual(['watch.close', 'source.upload'])
    expect(body.items[0]?.details).toBeNull()
    expect(body.items[1]?.details).toEqual({ file: 'mt.pdf' })
    expect(body.items[1]?.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    expect(body.nextBefore).toBeNull()
  })

  it('pages with limit and before until the last page', async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      await auditInsert(db, {
        actorEmail: 'admin@example.org',
        action: `test.${String(n)}`,
        target: 't',
      })
    }

    const first = auditListResponseSchema.parse(await (await list('?limit=2')).json())
    expect(first.items.map((i) => i.action)).toEqual(['test.5', 'test.4'])
    expect(first.nextBefore).toBe(first.items[1]?.id)

    const second = auditListResponseSchema.parse(
      await (await list(`?limit=2&before=${String(first.nextBefore)}`)).json(),
    )
    expect(second.items.map((i) => i.action)).toEqual(['test.3', 'test.2'])

    const last = auditListResponseSchema.parse(
      await (await list(`?limit=2&before=${String(second.nextBefore)}`)).json(),
    )
    expect(last.items.map((i) => i.action)).toEqual(['test.1'])
    expect(last.nextBefore).toBeNull()
  })

  it('rejects a bad query with 400', async () => {
    const res = await list('?limit=1000')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid query' })
  })

  it('is refused to a signed-in non-admin', async () => {
    const res = await call('/api/admin/audit', {
      token: await accessToken({ email: 'guest@example.org' }),
    })
    expect(res.status).toBe(403)
  })
})
