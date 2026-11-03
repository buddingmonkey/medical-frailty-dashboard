import { type DraftEntry, draftChecksResponseSchema, draftSummarySchema } from '@mfcd/shared'

import { accessToken, call } from './access-fixtures'

// Drafts and publishing through the admin API, as the browser does (publish and placement
// tests). Callers fill `sourceIds` with a source document per state first.

export const entry = (code: string, patch: Partial<DraftEntry> = {}): DraftEntry => ({
  codeSystem: 'icd10cm',
  rawCode: code,
  codeNorm: code.replace('.', ''),
  matchKind: 'exact',
  rangeEndNorm: null,
  includesChildren: 0,
  descriptionPublished: `Description of ${code}`,
  stateCategory: 'SMI',
  stateSubcategory: '',
  tier: '',
  qualification: 'standalone',
  qualificationBasis: 'published',
  sourceLocator: `row ${code}`,
  attributes: { included: true, flags: [] },
  ...patch,
})

export async function send(method: string, path: string, body?: unknown) {
  return call(path, { token: await accessToken(), method, ...(body === undefined ? {} : { body }) })
}

/** The source document each state's drafts cite, by state id. */
export const sourceIds: Record<string, number> = {}

/** A draft for `stateId` holding `rows`, sent as the browser does. Returns its id. */
export async function draftWith(stateId: string, rows: DraftEntry[]): Promise<number> {
  const res = await send('POST', '/api/admin/drafts', { stateId })
  const body: { item: unknown } = await res.json()
  const draft = draftSummarySchema.parse(body.item)
  const path = `/api/admin/drafts/${String(draft.id)}`
  const sourceDocumentId = sourceIds[stateId] ?? 0
  const part = 'Table 1'
  await send('PUT', `${path}/sources/${String(sourceDocumentId)}`, {
    part,
    expectedEntries: rows.length,
    invalidRowCount: 0,
    namedStateIds: [],
  })
  if (rows.length > 0) await send('POST', `${path}/rows`, { sourceDocumentId, part, entries: rows })
  return draft.id
}

export async function checksOf(id: number) {
  const res = await send('GET', `/api/admin/drafts/${String(id)}/checks`)
  return draftChecksResponseSchema.parse(await res.json())
}

/** Publishes with every confirmation the checks ask for (typed ones get the state code). */
export async function publishAll(id: number, stateId: string) {
  const { report, token } = await checksOf(id)
  const confirmations = Object.fromEntries(
    report.checks
      .filter((c) => c.triggered && (c.level === 'confirm' || c.level === 'confirm_typed'))
      .map((c) => [c.id, c.level === 'confirm_typed' ? { typed: stateId } : {}]),
  )
  return send('POST', `/api/admin/drafts/${String(id)}/publish`, { token, confirmations })
}
