import { z } from 'zod'

/** Body of `GET /api/public/health`. Unknown fields are stripped. */
export const healthResponseSchema = z.object({
  ok: z.literal(true),
  environment: z.string().min(1),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
