import { z } from 'zod'

/** Body of `GET /api/admin/whoami`: the signed-in admin. Unknown fields are stripped. */
export const whoamiResponseSchema = z.object({
  // Not z.email(): the local dev identity is `dev@localhost`, which has no TLD.
  email: z.string().min(1),
})

export type WhoamiResponse = z.infer<typeof whoamiResponseSchema>
