import {
  aiCleanupResponseSchema,
  aiCleanupStatusSchema,
  auditListResponseSchema,
} from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDb } from '../../db/client'
import { auditLog, states } from '../../db/schema'
import { accessToken, call, fakeAi } from '../../test/access-fixtures'
import { resetDb } from '../../test/reset-db'

const KEY = { ANTHROPIC_API_KEY: 'test-key' }
const body = {
  stateId: 'MT',
  fileName: 'mt.pdf',
  part: { number: 1, count: 2, firstPage: 1, lastPage: 40, text: 'F20.0  Paranoid schizophrenia' },
}

async function post(payload: unknown, vars: Partial<Env> = KEY) {
  return call('/api/admin/ai-cleanup', {
    token: await accessToken(),
    method: 'POST',
    body: payload,
    vars,
  })
}

describe('/api/admin/ai-cleanup', () => {
  beforeEach(async () => {
    await resetDb(env.DB)
    await createDb(env.DB)
      .insert(states)
      .values({ id: 'MT', slug: 'mt', name: 'Montana', fips: '30' })
    fakeAi.calls = []
    fakeAi.answer = () => ({
      text: '{"rows":[{"code":"F20.0"}]}',
      model: 'claude-opus-5-5',
      stopReason: 'end_turn',
      inputTokens: 1200,
      outputTokens: 30,
    })
  })

  it('is off, and the endpoint absent, while no API key is set', async () => {
    const res = await call('/api/admin/ai-cleanup', { token: await accessToken() })
    expect(aiCleanupStatusSchema.parse(await res.json())).toEqual({ enabled: false, model: null })
    expect((await post(body, {})).status).toBe(404)
    expect(fakeAi.calls).toEqual([])
  })

  it('builds the prompt on the server and returns the answer, with the model and tokens', async () => {
    const status = await call('/api/admin/ai-cleanup', { token: await accessToken(), vars: KEY })
    expect(aiCleanupStatusSchema.parse(await status.json())).toEqual({
      enabled: true,
      model: 'claude-opus-5-5',
    })
    const res = await post(body)
    expect(res.status).toBe(200)
    expect(aiCleanupResponseSchema.parse(await res.json())).toEqual({
      text: '{"rows":[{"code":"F20.0"}]}',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 1200, outputTokens: 30 },
    })
    const [sent] = fakeAi.calls
    expect(sent?.apiKey).toBe('test-key')
    expect(sent?.prompt).toContain(
      'State: Montana. File: mt.pdf. This is part 1 of 2 (pages 1–40).',
    )
    expect(sent?.prompt).toContain('<source_text>\nF20.0  Paranoid schizophrenia\n</source_text>')
  })

  it('uses the AI_MODEL variable when set', async () => {
    await post(body, { ...KEY, AI_MODEL: 'claude-sonnet-5-5' })
    expect(fakeAi.calls[0]?.model).toBe('claude-sonnet-5-5')
  })

  it('audits each call without the text', async () => {
    await post(body)
    const audit = auditListResponseSchema.parse(
      await (await call('/api/admin/audit', { token: await accessToken() })).json(),
    )
    expect(audit.items[0]).toMatchObject({ action: 'ai.cleanup', target: 'state:MT' })
    expect(JSON.stringify(audit.items[0])).not.toContain('schizophrenia')
  })

  it('stops at 30 calls an hour', async () => {
    await createDb(env.DB)
      .insert(auditLog)
      .values(
        Array.from({ length: 30 }, () => ({
          actorEmail: 'a@example.org',
          action: 'ai.cleanup',
          target: 'state:MT',
        })),
      )
    const res = await post(body)
    expect(res.status).toBe(429)
    expect(fakeAi.calls).toEqual([])
  })

  it('counts calls still in flight toward the hourly limit', async () => {
    await createDb(env.DB)
      .insert(auditLog)
      .values(
        Array.from({ length: 29 }, () => ({
          actorEmail: 'a@example.org',
          action: 'ai.cleanup',
          target: 'state:MT',
        })),
      )
    let finish = (): void => undefined
    const held = new Promise<void>((resolve) => {
      finish = resolve
    })
    const answer = fakeAi.answer
    fakeAi.answer = async () => {
      await held
      return answer()
    }
    const first = post(body)
    while (fakeAi.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 5))
    // The 30th call is still waiting for Claude: the 31st is refused all the same.
    const second = await post(body)
    expect(second.status).toBe(429)
    expect(fakeAi.calls).toHaveLength(1)
    finish()
    expect((await first).status).toBe(200)
    const rows = await createDb(env.DB).select().from(auditLog)
    expect(rows.filter((r) => r.action === 'ai.cleanup')).toHaveLength(30)
  })

  it('keeps a failed call counted and audited', async () => {
    fakeAi.answer = () => Promise.reject(new Error('network down'))
    const res = await post(body)
    expect(res.status).toBe(500)
    const rows = await createDb(env.DB).select().from(auditLog)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.action).toBe('ai.cleanup')
    expect(JSON.parse(rows[0]?.detailsJson ?? '{}')).toMatchObject({ outcome: 'failed' })
  })

  it('says when the model declined, and refuses an unknown state or a bad body', async () => {
    fakeAi.answer = () => ({
      text: '',
      model: 'claude-opus-5-5',
      stopReason: 'refusal',
      inputTokens: 1,
      outputTokens: 0,
    })
    expect((await post(body)).status).toBe(422)
    expect((await post({ ...body, stateId: 'ZZ' })).status).toBe(400)
    expect((await post({ ...body, part: { ...body.part, text: '' } })).status).toBe(400)
  })
})
