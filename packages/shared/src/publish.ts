import { z } from 'zod'

import type { CheckId } from './checks'
import { versionStatuses } from './enums'

// Publish and rollback (docs/data-model.md, "Replacing a state's list").

const checkIds = [
  'empty',
  'invalid_rows',
  'incomplete_upload',
  'state_mismatch',
  'large_change',
  'code_system_missing',
  'category_missing',
  'unknown_icd10cm',
  'excluded_rows',
  'duplicates',
  'unresolved_flags',
  'same_source',
] as const satisfies readonly CheckId[]

/** Body of `POST /api/admin/drafts/:id/publish`. `token` comes from the checks the admin saw:
 * if the rows changed since, the publish is refused. */
export const publishRequestSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  confirmations: z.partialRecord(
    z.enum(checkIds),
    z.object({ typed: z.string().max(20).optional() }),
  ),
})
export type PublishRequest = z.infer<typeof publishRequestSchema>

export const publishResponseSchema = z.object({
  ok: z.literal(true),
  /** R2 key of the backup of the version this publish replaced; null on a first publish. */
  backupKey: z.string().nullable(),
})

/** Body of `POST /api/admin/states/:stateId/rollback`. */
export const rollbackRequestSchema = z.object({ versionId: z.number().int().positive() })

export const versionListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      versionNo: z.number().int().positive(),
      status: z.enum(versionStatuses),
      rowCount: z.number().int().nonnegative(),
      createdBy: z.string(),
      createdAt: z.string(),
      publishedBy: z.string().nullable(),
      publishedAt: z.string().nullable(),
    }),
  ),
})
export type VersionListItem = z.infer<typeof versionListResponseSchema>['items'][number]
