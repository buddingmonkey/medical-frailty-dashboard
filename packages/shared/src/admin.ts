import { z } from 'zod'

/** Body of `GET /api/admin/whoami`: the signed-in admin. Unknown fields are stripped. */
export const whoamiResponseSchema = z.object({
  // Not z.email(): the local dev identity is `dev@localhost`, which has no TLD.
  email: z.string().min(1),
})

export type WhoamiResponse = z.infer<typeof whoamiResponseSchema>

/** Query of `GET /api/admin/audit`: newest first, `before` is the last id of the previous page. */
export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().positive().optional(),
})

export type AuditQuery = z.infer<typeof auditQuerySchema>

/** One admin action. `actorEmail` is an admin's Access identity, never a member's. */
export const auditEntrySchema = z.object({
  id: z.number().int().positive(),
  at: z.string().min(1),
  actorEmail: z.string().min(1),
  action: z.string().min(1),
  target: z.string().min(1),
  details: z.record(z.string(), z.unknown()).nullable(),
})

export type AuditEntry = z.infer<typeof auditEntrySchema>

/** Body of `GET /api/admin/audit`. `nextBefore` is null on the last page. */
export const auditListResponseSchema = z.object({
  items: z.array(auditEntrySchema),
  nextBefore: z.number().int().positive().nullable(),
})

export type AuditListResponse = z.infer<typeof auditListResponseSchema>

/** A numeric row id in a URL path, e.g. `PUT /api/admin/watch/:id`. */
export const idParamSchema = z.coerce.number().int().positive()
