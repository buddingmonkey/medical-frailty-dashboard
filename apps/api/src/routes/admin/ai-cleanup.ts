import {
  aiCleanupRequestSchema,
  aiCleanupResponseSchema,
  aiCleanupStatusSchema,
  buildCleanupPrompt,
} from '@mfcd/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

import { type AiComplete, type AiCompletion, DEFAULT_AI_MODEL } from '../../ai/claude'
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

      // Reserve the call before it starts: one statement inserts its audit row only while
      // fewer than AI_CALLS_PER_HOUR rows are in the last hour, so calls still waiting for
      // Claude count too and parallel requests cannot all pass the check.
      const { part } = body.data
      const target = `state:${body.data.stateId}`
      const facts = {
        fileName: body.data.fileName,
        part: `${String(part.number)} of ${String(part.count)}`,
      }
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
      const reserved = await c.env.DB.prepare(
        `INSERT INTO audit_log (actor_email, action, target, details_json)
         SELECT ?1, 'ai.cleanup', ?2, ?3
         WHERE (SELECT count(*) FROM audit_log WHERE action = 'ai.cleanup' AND at > ?4) < ?5
         RETURNING id`,
      )
        .bind(
          c.var.identity?.email ?? '',
          target,
          JSON.stringify({ ...facts, outcome: 'pending' }),
          hourAgo,
          AI_CALLS_PER_HOUR,
        )
        .first<{ id: number }>()
      if (!reserved) {
        return c.json({ error: 'The hourly limit of AI calls is reached. Try again later.' }, 429)
      }
      const record = (details: Record<string, unknown>) =>
        db
          .update(auditLog)
          .set({ detailsJson: JSON.stringify({ ...facts, ...details }) })
          .where(eq(auditLog.id, reserved.id))

      const model = c.env.AI_MODEL ?? DEFAULT_AI_MODEL
      const prompt = buildCleanupPrompt({
        stateName: state.name,
        fileName: body.data.fileName,
        part: body.data.part,
      })
      let answer: AiCompletion
      try {
        answer = await complete(apiKey, model, prompt)
      } catch (err) {
        // The row stays and keeps counting: the call may have cost tokens before it failed.
        await record({ outcome: 'failed', model })
        throw err
      }
      await record({
        outcome: 'answered',
        model: answer.model,
        stopReason: answer.stopReason,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
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
