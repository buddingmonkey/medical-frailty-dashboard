import { z } from 'zod'

// Lookups in ref_codes, the CMS code lists (ICD-10-CM and HCPCS). The review step uses them to
// settle "ICD-10-CM or HCPCS?" for undotted sources and to point out codes CMS does not list.

export const refSystems = ['icd10cm', 'hcpcs'] as const
export type RefSystem = (typeof refSystems)[number]

/** Codes per `POST /api/admin/ref-codes/lookup`. */
export const REF_LOOKUP_MAX = 1_000

/** Body of `POST /api/admin/ref-codes/lookup`: normalized codes (`F200`, `J1630`). */
export const refLookupRequestSchema = z.object({
  codes: z
    .array(z.string().regex(/^[0-9A-Z]{1,7}$/))
    .min(1)
    .max(REF_LOOKUP_MAX),
})

export const refLookupResponseSchema = z.object({
  items: z.array(
    z.object({
      codeNorm: z.string(),
      codeSystem: z.enum(refSystems),
      /** ICD-10-CM: false for header codes. HCPCS: null. */
      billable: z.boolean().nullable(),
    }),
  ),
})
export type RefLookupItem = z.infer<typeof refLookupResponseSchema>['items'][number]

/** The CMS systems each looked-up code is in; `[]` when looked up and found in none. A code
 * missing from the map has not been looked up yet. */
export type ReferenceIndex = ReadonlyMap<string, readonly RefSystem[]>

/** A new index: `previous` plus the answer for `asked`. */
export function referenceIndex(
  previous: ReferenceIndex,
  asked: readonly string[],
  found: readonly RefLookupItem[],
): ReferenceIndex {
  const next = new Map<string, RefSystem[]>(
    [...previous].map(([code, systems]) => [code, [...systems]]),
  )
  for (const code of asked) if (!next.has(code)) next.set(code, [])
  for (const item of found) {
    const systems = next.get(item.codeNorm) ?? []
    if (!systems.includes(item.codeSystem)) systems.push(item.codeSystem)
    next.set(item.codeNorm, systems)
  }
  return next
}
