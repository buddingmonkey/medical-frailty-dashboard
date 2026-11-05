import {
  type CodeDetailEntry,
  type CodeDetailResponse,
  codeDetailResponseSchema,
  type CodeDetailState,
  type CodeSystem,
  codeUrlPath,
  displayEntryCode,
  formatCode,
  type MatchKind,
  parseCodeUrl,
  parseShowQualification,
  type Qualification,
  type QualificationBasis,
  visibleRule,
} from '@mfcd/shared'
import { asc, eq, sql } from 'drizzle-orm'

import type { Db } from './client'
import { codeGroups, likeCodes } from './public-code-like'
import { patternKeySql, rowCols } from './code-match'
import { narrowerCount, shared } from './public-drill'
import { appMeta, states } from './schema'

// The code detail page's data (roadmap M6 step 3): one code, every state's status in the M4
// words (docs/data-model.md, "Matching across states"). The matching is the drill-down's SQL
// (`shared` in public-drill.ts) with the code as its one row, so there is one matcher. Four
// queries: the states, the setting, the CMS text, and the matching entries with their sources;
// plus one for narrower codes under the code. Only published versions are read. Like codes
// (step 4, public-code-like.ts) add the code's condition groups and, when needed, one more.

/** Systems with CMS text in `ref_codes` (public domain). Never CPT. */
const cmsSystems: readonly CodeSystem[] = ['icd10cm', 'hcpcs']

interface MatchRow {
  state_id: string
  how: number
  raw_code: string
  code_system: CodeSystem
  code_norm: string
  match_kind: MatchKind
  range_end_norm: string | null
  includes_children: number | null
  description_published: string | null
  state_category: string
  state_subcategory: string
  tier: string | null
  qualification: Qualification
  qualification_basis: QualificationBasis
  source_locator: string | null
  source_title: string
  source_url: string | null
  source_date: string | null
}

/** One code's page; null when the path is malformed or the code is unknown and unlisted. */
export async function publicCode(
  db: Db,
  systemSlug: string,
  code: string,
  dataVersion: number,
): Promise<CodeDetailResponse | null> {
  const parsed = parseCodeUrl(systemSlug, code)
  if (!parsed) return null
  const { system, codeNorm } = parsed

  // The code as the drill-down's one row: a single code (M4: nothing is inside it).
  const one = sql`SELECT ${system} AS sys, 'exact' AS kind, ${codeNorm} AS norm,
    NULL AS end_norm, 0 AS wild`

  const [stateRows, setting, cms, matches, narrower, groups] = await Promise.all([
    db
      .select({
        id: states.id,
        slug: states.slug,
        name: states.name,
        vid: states.publishedVersionId,
      })
      .from(states)
      .orderBy(asc(states.name)),
    db.select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, 'show_qualification')),
    cmsSystems.includes(system)
      ? db.all<{ description: string }>(sql`SELECT description FROM ref_codes
          WHERE code_system = ${system} AND code_norm = ${codeNorm}
          ORDER BY valid_from DESC LIMIT 1`)
      : Promise.resolve([]),
    db.all<MatchRow>(sql`${shared(one)}
      SELECT c.state_id, c.how, e.raw_code, e.code_system, e.code_norm, e.match_kind,
        e.range_end_norm, e.includes_children, e.description_published, e.state_category,
        e.state_subcategory, e.tier, e.qualification, e.qualification_basis, e.source_locator,
        d.title AS source_title, d.url AS source_url, d.publisher_date AS source_date
      FROM cand c
      JOIN entries e ON e.id = c.entry_id
      JOIN source_documents d ON d.id = e.source_document_id
      ORDER BY c.state_id, c.how, c.qrank, e.code_norm, e.id`),
    // Under the code as if it were a wildcard: the states that neither list nor cover it.
    db.all<{ state_id: string; n: number }>(sql`${shared(one)},
      wide0 AS (SELECT sys, 'prefix' AS kind, norm, NULL AS end_norm, 1 AS wild FROM drows),
      wide AS (SELECT *, norm AS last_norm, ${patternKeySql(rowCols())} AS rk FROM wide0)
      SELECT p.state_id, ${narrowerCount('w', 'p.vid')} AS n
      FROM pub p CROSS JOIN wide w
      WHERE NOT EXISTS (SELECT 1 FROM best b WHERE b.state_id = p.state_id)`),
    codeGroups(db, system, codeNorm),
  ])

  const description = cms[0]?.description ?? null
  if (description === null && matches.length === 0) return null

  const show = parseShowQualification(setting[0]?.value)
  const byState = new Map<string, MatchRow[]>()
  for (const m of matches) {
    const list = byState.get(m.state_id)
    if (list) list.push(m)
    else byState.set(m.state_id, [m])
  }
  const narrowerBy = new Map(narrower.map((r) => [r.state_id, r.n]))

  const toEntry = (m: MatchRow): CodeDetailEntry => ({
    rawCode: m.raw_code,
    display: displayEntryCode({
      codeSystem: m.code_system,
      codeNorm: m.code_norm,
      matchKind: m.match_kind,
      rangeEndNorm: m.range_end_norm,
      includesChildren: m.includes_children === 1 ? 1 : m.includes_children === 0 ? 0 : null,
    }),
    matchKind: m.match_kind,
    description:
      m.description_published !== null && m.description_published.trim() !== ''
        ? m.description_published
        : null,
    stateCategory: m.state_category,
    stateSubcategory: m.state_subcategory,
    tier: m.tier,
    ...visibleRule(
      { qualification: m.qualification, qualificationBasis: m.qualification_basis },
      show,
    ),
    source: {
      title: m.source_title,
      url: m.source_url,
      publisherDate: m.source_date,
      locator: m.source_locator,
    },
  })

  const toState = (s: (typeof stateRows)[number]): CodeDetailState => {
    const base = { id: s.id, slug: s.slug, name: s.name, narrowerCount: 0, entries: [] }
    if (s.vid === null) return { ...base, status: 'no_list' }
    const found = byState.get(s.id)
    if (found) {
      return {
        ...base,
        status: found.some((m) => m.how === 0) ? 'exact' : 'covered',
        entries: found.map(toEntry),
      }
    }
    const n = narrowerBy.get(s.id) ?? 0
    return n > 0
      ? { ...base, status: 'narrower', narrowerCount: n }
      : { ...base, status: 'not_listed' }
  }

  const statesOut = stateRows.map(toState)
  const like = await likeCodes(
    db,
    system,
    groups,
    statesOut.filter((s) => s.status === 'not_listed' || s.status === 'narrower').map((s) => s.id),
  )

  return codeDetailResponseSchema.parse({
    dataVersion,
    code: {
      codeSystem: system,
      codeNorm,
      display: formatCode(system, codeNorm),
      path: codeUrlPath(system, codeNorm) ?? parsed.canonicalPath,
      description,
    },
    showQualification: show,
    conditionGroups: groups.map((g) => ({ slug: g.slug, name: g.name })),
    states: statesOut.map((s) => ({ ...s, likeCodes: like.get(s.id) ?? [] })),
  })
}
