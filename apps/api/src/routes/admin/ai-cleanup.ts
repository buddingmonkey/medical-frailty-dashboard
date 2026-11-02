import {
  aiCleanupRequestSchema,
  aiCleanupResponseSchema,
  aiCleanupStatusSchema,
  buildCleanupPrompt,
} from '@mfcd/shared'
import { and, count, eq, gt } from 'drizzle-orm'
import { Hono } from 'hono'

import { type AiComplete, DEFAULT_AI_MODEL } from '../../ai/claude'
import { auditInsert } from '../../db/audit'
import { createDb } from '../../db/client'
import { auditLog, states } from '../../db/schema'
import type { AppEnv } from '../../types'

// Optional Claude API button for AI cleanup (docs/ingestion.md, "AI cleanup";
// docs/security.md, "AI cleanup"). Mounted behind requireAdmin and adminWriteGuard. Without the
// ANTHROPIC_API_KEY secret the call does not exist (404). The answer is returned as text and
// validated in the browser like a pasted answer: it is data, never instructions.

/** Calls per hour, all admins together (docs/security.md). */
export const AI_CALLS_PER_HOUR = 30

export function aiCleanupRoute(complete: AiComplete) {
  return new Hono<AppEnv>()
    .get('/', (c) => {
      const enabled = Boolean(c.env.ANTHROPIC_API_KEY)
      return c.json(
        aiCleanupStatusSchema.parse({
          enabled,
          model: enabled ? (c.env.AI_MODEL ?? DEFAULT_AI_MODEL) : null,
        }),
      )
    })

    .post('/', async (c) => {
      const apiKey = c.env.ANTHROPIC_API_KEY
      if (!apiKey) return c.json({ error: 'Not found' }, 404)
      const body = aiCleanupRequestSchema.safeParse(await c.req.json().catch(() => null))
      if (!body.success) return c.json({ error: 'Invalid request' }, 400)
      const db = createDb(c.env.DB)
      const [state] = await db
        .select({ name: states.name })
        .from(states)
        .where(eq(states.id, body.data.stateId))
      if (!state) return c.json({ error: 'Unknown state' }, 400)

      const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
      const [recent] = await db
        .select({ n: count() })
        .from(auditLog)
        .where(and(eq(auditLog.action, 'ai.cleanup'), gt(auditLog.at, hourAgo)))
      if ((recent?.n ?? 0) >= AI_CALLS_PER_HOUR) {
        return c.json({ error: 'The hourly limit of AI calls is reached. Try again later.' }, 429)
      }

      const model = c.env.AI_MODEL ?? DEFAULT_AI_MODEL
      const prompt = buildCleanupPrompt({
        stateName: state.name,
        fileName: body.data.fileName,
        part: body.data.part,
      })
      const answer = await complete(apiKey, model, prompt)
      const { part } = body.data
      await auditInsert(db, {
        actorEmail: c.var.identity?.email ?? '',
        action: 'ai.cleanup',
        target: `state:${body.data.stateId}`,
        details: {
          fileName: body.data.fileName,
          part: `${String(part.number)} of ${String(part.count)}`,
          model: answer.model,
          stopReason: answer.stopReason,
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
        },
      })
      if (answer.stopReason === 'refusal') {
        return c.json(
          { error: 'The model declined this part. Use the copy-and-paste prompt instead.' },
          422,
        )
      }
      if (answer.stopReason === 'max_tokens') {
        return c.json(
          { error: 'The answer was cut off: this part is too long for one answer.' },
          422,
        )
      }
      return c.json(
        aiCleanupResponseSchema.parse({
          text: answer.text,
          model: answer.model,
          usage: { inputTokens: answer.inputTokens, outputTokens: answer.outputTokens },
        }),
      )
    })
}
