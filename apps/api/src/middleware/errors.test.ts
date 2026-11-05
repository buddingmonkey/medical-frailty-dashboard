import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { accessToken, call } from '../test/access-fixtures'
import { resetDb } from '../test/reset-db'

// Server errors (src/middleware/errors.ts): admin routes say what happened and give a reference;
// public routes keep the generic text. The broken D1 binding throws what D1 threw on preview.
const cpuLimit = 'D1_ERROR: D1 DB exceeded its CPU time limit and was reset.'

const overloaded =
  'D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window'

const failingDb = (message: string) => {
  const fail = () => {
    throw new Error(message)
  }
  return {
    prepare: fail,
    batch: fail,
    exec: fail,
    dump: fail,
    withSession: fail,
  } as unknown as D1Database
}
const brokenDb = failingDb(cpuLimit)

let errors: string[] = []
const logged = () => errors.map((line) => JSON.parse(line) as unknown)

describe('server errors', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    errors = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errors.push(String(line))
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tells an admin what happened, with the cf-ray as the reference', async () => {
    const res = await call('/api/admin/coverage/rebuild', {
      token: await accessToken(),
      method: 'POST',
      body: {},
      vars: { DB: brokenDb },
      headers: { 'cf-ray': '8f2a1c3d4e5f6a7b-DFW' },
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error:
        'The database took too long on this step and stopped it. Nothing was saved from the unfinished step. Try again; if it keeps failing, report it with reference 8f2a1c3d4e5f6a7b-DFW.',
    })
    expect(logged()).toContainEqual({
      level: 'error',
      message: cpuLimit,
      method: 'POST',
      path: '/api/admin/coverage/rebuild',
      ref: '8f2a1c3d4e5f6a7b-DFW',
    })
  })

  it('marks a busy database as retryable, so the admin page can wait and try again', async () => {
    const res = await call('/api/admin/coverage/rebuild', {
      token: await accessToken(),
      method: 'POST',
      body: {},
      vars: { DB: failingDb(overloaded) },
      headers: { 'cf-ray': '8f2a1c3d4e5f6a7b-DFW' },
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error:
        'The database was busy, or the connection to it dropped. Earlier steps are saved; the unfinished one will redo safely. Wait a minute and try again; if it keeps failing, report it with reference 8f2a1c3d4e5f6a7b-DFW.',
      retryable: true,
    })
  })

  it('does not mark other failures as retryable', async () => {
    const res = await call('/api/admin/coverage/rebuild', {
      token: await accessToken(),
      method: 'POST',
      body: {},
      vars: { DB: brokenDb },
    })
    expect(await res.json()).not.toHaveProperty('retryable')
  })

  it('makes up a short reference when there is no cf-ray', async () => {
    const res = await call('/api/admin/coverage/rebuild', {
      token: await accessToken(),
      method: 'POST',
      body: {},
      vars: { DB: brokenDb },
    })
    const { error } = await res.json<{ error: string }>()
    const ref = /reference ([0-9a-f]{8})\.$/.exec(error)?.[1]
    expect(ref).toBeDefined()
    expect(logged()).toContainEqual(expect.objectContaining({ ref }))
  })

  it('keeps the generic text on public routes, even for a busy database', async () => {
    const res = await call('/api/public/states', {
      token: await accessToken(),
      vars: { DB: failingDb(overloaded) },
    })
    expect(await res.json()).toEqual({ error: 'Internal error' })
  })

  it('keeps the generic text on public routes, and logs the reference', async () => {
    // The token only passes the pre-launch site gate; the route is public.
    const res = await call('/api/public/states', {
      token: await accessToken(),
      vars: { DB: brokenDb },
      headers: { 'cf-ray': '8f2a1c3d4e5f6a7b-DFW' },
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal error' })
    expect(logged()).toContainEqual(
      expect.objectContaining({ message: cpuLimit, ref: '8f2a1c3d4e5f6a7b-DFW' }),
    )
  })
})
