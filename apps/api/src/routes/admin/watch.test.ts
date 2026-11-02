import { auditListResponseSchema, watchItemSchema, watchListResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDb } from '../../db/client'
import { states } from '../../db/schema'
import { ADMIN, accessToken, call } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

const item = {
  title: 'Re-check Montana list',
  kind: 'state_list',
  dueDate: '2026-11-20',
  whyMd: 'States reissue their lists.',
  links: [{ label: 'DPHHS', url: 'https://dphhs.mt.gov/' }],
}

async function api(path: string, method = 'GET', body?: unknown) {
  return call(`/api/admin/watch${path}`, { token: await accessToken(), method, body })
}

async function create(body: unknown = item) {
  const res = await api('', 'POST', body)
  expect(res.status).toBe(201)
  return watchItemSchema.parse(await res.json())
}

async function listItems(status: 'open' | 'closed' = 'open') {
  return watchListResponseSchema.parse(await (await api(`?status=${status}`)).json()).items
}

async function auditActions() {
  const res = await call('/api/admin/audit', { token: await accessToken() })
  return auditListResponseSchema.parse(await res.json()).items
}

describe('/api/admin/watch', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    vi.useRealTimers()
  })

  it('creates an item with the admin as author and audits it', async () => {
    const created = await create()

    expect(created).toMatchObject({
      title: 'Re-check Montana list',
      status: 'open',
      createdBy: ADMIN,
      links: item.links,
      dateIsApproximate: false,
      stateId: null,
    })
    expect(await listItems()).toEqual([created])
    const [entry] = await auditActions()
    expect(entry).toMatchObject({
      action: 'watch.create',
      target: `watch:${String(created.id)}`,
      actorEmail: ADMIN,
    })
  })

  it('lists open items by due date, undated last', async () => {
    await create({ ...item, title: 'later', dueDate: '2027-01-01' })
    await create({ ...item, title: 'undated', dueDate: null })
    await create({ ...item, title: 'sooner', dueDate: '2026-11-05' })

    expect((await listItems()).map((i) => i.title)).toEqual(['sooner', 'later', 'undated'])
  })

  it('rejects bad input with 400 and writes nothing', async () => {
    for (const body of [
      { ...item, title: '' },
      { ...item, links: [{ label: 'x', url: 'javascript:alert(1)' }] },
      { ...item, kind: 'rumour' },
    ]) {
      const res = await api('', 'POST', body)
      expect(res.status).toBe(400)
    }
    expect(await listItems()).toEqual([])
    expect(await auditActions()).toEqual([])
  })

  it('refuses a state that is not in the database', async () => {
    const res = await api('', 'POST', { ...item, stateId: 'ZZ' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Unknown state' })

    await createDb(env.DB)
      .insert(states)
      .values({ id: 'MT', slug: 'mt', name: 'Montana', fips: '30' })
    expect((await create({ ...item, stateId: 'MT' })).stateId).toBe('MT')
  })

  it('edits an open item and audits it', async () => {
    const created = await create()

    const res = await api(`/${String(created.id)}`, 'PUT', {
      action: 'edit',
      ...item,
      title: 'Re-check MT list',
      dueDate: '2026-12-01',
      dateIsApproximate: true,
    })

    expect(res.status).toBe(200)
    expect(watchItemSchema.parse(await res.json())).toMatchObject({
      title: 'Re-check MT list',
      dueDate: '2026-12-01',
      dateIsApproximate: true,
    })
    expect((await auditActions())[0]?.action).toBe('watch.edit')
  })

  it('closes with a resolution note; the item moves to history and the close is audited', async () => {
    const created = await create()

    const res = await api(`/${String(created.id)}`, 'PUT', {
      action: 'close',
      status: 'done',
      resolutionMd: 'Checked 2026-11-20; no change.',
    })

    expect(res.status).toBe(200)
    expect(await listItems()).toEqual([])
    const [closed] = await listItems('closed')
    expect(closed).toMatchObject({
      status: 'done',
      resolutionMd: 'Checked 2026-11-20; no change.',
      resolvedBy: ADMIN,
    })
    expect(closed?.resolvedAt).toMatch(/^\d{4}-\d\d-\d\dT/)
    const [entry] = await auditActions()
    expect(entry).toMatchObject({
      action: 'watch.close',
      details: { status: 'done', resolution: 'Checked 2026-11-20; no change.' },
    })
  })

  it('refuses to close without a note, or to change a closed item', async () => {
    const created = await create()
    const path = `/${String(created.id)}`

    expect(
      (await api(path, 'PUT', { action: 'close', status: 'done', resolutionMd: '' })).status,
    ).toBe(400)

    await api(path, 'PUT', { action: 'close', status: 'dismissed', resolutionMd: 'Not needed.' })
    const again = await api(path, 'PUT', { action: 'edit', ...item })
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: 'Item is already closed' })
  })

  it('closing a repeating item creates the next one', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-18T15:00:00Z'), toFake: ['Date'] })
    const created = await create({ ...item, repeatDays: 90 })

    await api(`/${String(created.id)}`, 'PUT', {
      action: 'close',
      status: 'done',
      resolutionMd: 'Checked.',
    })

    const [next] = await listItems()
    expect(next).toMatchObject({
      title: 'Re-check Montana list',
      dueDate: '2027-02-18',
      repeatDays: 90,
      status: 'open',
      createdBy: ADMIN,
    })
    expect(next?.id).not.toBe(created.id)
    expect((await auditActions()).map((e) => e.action)).toEqual(['watch.close', 'watch.create'])
  })

  it('returns 404 for an unknown id and 400 for a bad one', async () => {
    expect(
      (await api('/999', 'PUT', { action: 'close', status: 'done', resolutionMd: 'x' })).status,
    ).toBe(404)
    expect(
      (await api('/abc', 'PUT', { action: 'close', status: 'done', resolutionMd: 'x' })).status,
    ).toBe(400)
  })

  it('is refused to a signed-in non-admin', async () => {
    const res = await call('/api/admin/watch', {
      token: await accessToken({ email: 'guest@example.org' }),
      method: 'POST',
      body: item,
    })
    expect(res.status).toBe(403)
  })
})
