// Synthetic code lists for the states without a real one, so preview's public pages show 51
// states (scripts/make-seed.ts; docs/deployment.md, "Preview data"). Every entry is a code
// pattern from the real lists' pool, never their published text: `description_published` is
// NULL, so no state's (or the AMA's CPT) wording is copied into another state. Deterministic: one
// seeded PRNG per state id, consumed in a fixed order over sorted inputs.
import { createHash } from 'node:crypto'

/** Id offsets, far above the real rows' ids (make-seed checks). */
export const SYNTHETIC_IDS = {
  source: 1000,
  version: 1000,
  entry: 1_000_000,
  /** Entry ids per state: `entry + index * entriesPerState`. */
  entriesPerState: 10_000,
  categoryMapping: 100_000,
  unifiedMapping: 100_000,
}

export const SYNTHETIC_TITLE = 'Synthetic test list (seed data, not a real state list)'

/** A code pattern from a real list: no text, no category. */
export interface PoolEntry {
  code_system: string
  raw_code: string
  code_norm: string
  match_kind: string
  range_end_norm: string | null
  includes_children: number | null
}

/** A pool entry and the universe codes of one unified category it covers. */
export interface Candidate {
  entry: PoolEntry
  covers: readonly string[]
}

export interface StarterCategory {
  id: number
  slug: string
  federal_category: string
}

export interface SyntheticContext {
  /** The unified categories, by sort order. */
  categories: readonly StarterCategory[]
  /** Per slug, the ICD-10-CM pool entries that cover some of its universe. */
  candidates: ReadonlyMap<string, readonly Candidate[]>
  /** Per slug, the universe size (missing or 0: no full list). */
  universeSize: ReadonlyMap<string, number>
  /**
   * Pool entries in other code systems (HCPCS, CPT, revenue, drug class): the full list of a
   * category without a universe, which states take a share of (`mixSystems`).
   */
  nonIcd: readonly PoolEntry[]
  actor: string
}

export type Band = 'high' | 'mid' | 'low' | 'none'

/** Target share range and hard cap per band (the overview rounds to whole percents: 25 and 75). */
const BANDS: Record<Exclude<Band, 'none'>, { lo: number; hi: number; cap: number }> = {
  high: { lo: 0.8, hi: 0.97, cap: 1 },
  mid: { lo: 0.3, hi: 0.68, cap: 0.744 },
  low: { lo: 0.04, hi: 0.2, cap: 0.244 },
}

/** Mulberry32: a small seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a, 32 bits. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

const rngOf = (key: string) => mulberry32(hash(key))

function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i] as T
    out[i] = out[j] as T
    out[j] = a
  }
  return out
}

const pick = <T>(list: readonly T[], rng: () => number): T =>
  list[Math.floor(rng() * list.length)] as T

/** Whether an ICD-10-CM entry covers a code, by the overview's rules (db/public-overview.ts). */
export function entryCovers(e: PoolEntry, code: string): boolean {
  if (e.code_system !== 'icd10cm') return false
  const start = e.code_norm
  const end = e.range_end_norm ?? ''
  if (e.match_kind === 'exact')
    return code === start || (e.includes_children === 1 && code.startsWith(start))
  if (e.match_kind === 'prefix') return code.startsWith(start)
  if (e.match_kind !== 'range') return false
  if (e.includes_children === 1)
    return (
      code >= start &&
      code < `${end}~` &&
      code.slice(0, start.length) >= start &&
      code.slice(0, end.length) <= end
    )
  return code >= start && code <= end && code.length === start.length
}

export const poolKey = (e: PoolEntry) =>
  [
    e.code_system,
    e.match_kind,
    e.code_norm,
    e.range_end_norm ?? '',
    String(e.includes_children),
  ].join('|')

/** The pool without repeats, in key order. */
export function dedupePool(pool: readonly PoolEntry[]): PoolEntry[] {
  const seen = new Map<string, PoolEntry>()
  for (const e of pool) {
    const key = poolKey(e)
    const had = seen.get(key)
    if (!had || e.raw_code < had.raw_code) seen.set(key, e)
  }
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, e]) => e)
}

/**
 * The pool plus the 3-character category code (with its children, as states list them) of each
 * ICD-10-CM code whose category the pool lacks: broad entries reach high coverage cheaply.
 */
export function withCategoryCodes(pool: readonly PoolEntry[]): PoolEntry[] {
  const has = new Set(
    pool
      .filter((e) => e.code_system === 'icd10cm' && e.code_norm.length === 3)
      .filter((e) => e.match_kind === 'prefix' || e.includes_children === 1)
      .map((e) => e.code_norm),
  )
  const heads = [
    ...new Set(
      pool
        .filter((e) => e.code_system === 'icd10cm' && e.code_norm.length > 3)
        .map((e) => e.code_norm.slice(0, 3)),
    ),
  ]
    .filter((h) => !has.has(h))
    .sort()
  return [
    ...pool,
    ...heads.map((h) => ({
      code_system: 'icd10cm',
      raw_code: h,
      code_norm: h,
      match_kind: 'exact',
      range_end_norm: null,
      includes_children: 1,
    })),
  ]
}

/** Up to `size` entries, one code system after another (systems in name order). */
export function mixSystems(list: readonly PoolEntry[], size: number): PoolEntry[] {
  const bySystem = new Map<string, PoolEntry[]>()
  for (const e of list) bySystem.set(e.code_system, [...(bySystem.get(e.code_system) ?? []), e])
  const queues = [...bySystem.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v)
  const out: PoolEntry[] = []
  while (out.length < size && queues.some((q) => q.length > 0))
    for (const q of queues) {
      const next = q.shift()
      if (next && out.length < size) out.push(next)
    }
  return out
}

/** Per category, the pool's ICD-10-CM entries that cover some of its universe. */
export function buildCandidates(
  pool: readonly PoolEntry[],
  universe: ReadonlyMap<string, readonly string[]>,
): Map<string, Candidate[]> {
  const icd = dedupePool(pool).filter((e) => e.code_system === 'icd10cm')
  const out = new Map<string, Candidate[]>()
  for (const [slug, codes] of universe) {
    const byHead = new Map<string, string[]>()
    for (const c of [...codes].sort())
      byHead.set(c.slice(0, 3), [...(byHead.get(c.slice(0, 3)) ?? []), c])
    const all = [...byHead.values()].flat()
    const list: Candidate[] = []
    for (const e of icd) {
      const scope =
        e.match_kind !== 'range' && e.code_norm.length >= 3
          ? (byHead.get(e.code_norm.slice(0, 3)) ?? [])
          : all
      const covers = scope.filter((c) => entryCovers(e, c))
      if (covers.length > 0) list.push({ entry: e, covers })
    }
    out.set(slug, list)
  }
  return out
}

/**
 * Pool entries whose covered codes reach a share inside `band` of the universe: broad entries
 * first for `high`, narrow first for `low`, broad-leaning for `mid`. An entry that would push the
 * share past the band's cap, or adds nothing, is skipped. At most `max` entries.
 */
export function pickForTarget(
  candidates: readonly Candidate[],
  universeSize: number,
  band: Band,
  rng: () => number,
  max: number,
): { entries: PoolEntry[]; covered: number } {
  if (band === 'none' || universeSize === 0) return { entries: [], covered: 0 }
  const { lo, hi, cap } = BANDS[band]
  const target = Math.max(1, Math.round((lo + rng() * (hi - lo)) * universeSize))
  const limit = Math.max(1, Math.floor(cap * universeSize))
  const shuffled = shuffle(candidates, rng)
  // Mid: broad-leaning but mixed, so a large universe still reaches 25% within `max`.
  const weight = new Map(shuffled.map((c) => [c, c.covers.length * (0.25 + rng())]))
  const order =
    band === 'high'
      ? shuffled.sort((a, b) => b.covers.length - a.covers.length)
      : band === 'low'
        ? shuffled.sort((a, b) => a.covers.length - b.covers.length)
        : shuffled.sort((a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0))
  const covered = new Set<string>()
  const entries: PoolEntry[] = []
  for (const c of order) {
    if (entries.length >= max || covered.size >= target) break
    const gain = c.covers.filter((x) => !covered.has(x))
    if (gain.length === 0 || covered.size + gain.length > limit) continue
    for (const x of gain) covered.add(x)
    entries.push(c.entry)
  }
  // Single codes the broad entries already cover (states often list both F20 and F200): more
  // rows, same share.
  const extra = Math.floor(rng() * 25)
  const listed = new Set(entries)
  for (const c of order) {
    if (entries.length >= max || entries.length - listed.size >= extra) break
    if (!listed.has(c.entry) && c.covers.length === 1 && covered.has(c.covers[0] ?? ''))
      entries.push(c.entry)
  }
  return { entries, covered: covered.size }
}

/**
 * 40 published, 4 announced, the rest none (3 of 47), by a hash of each id, so the split does
 * not depend on the input order.
 */
export function assignStatuses(
  ids: readonly string[],
): Map<string, 'published' | 'announced' | 'none'> {
  const order = [...ids].sort(
    (a, b) => hash(`status:${a}`) - hash(`status:${b}`) || (a < b ? -1 : 1),
  )
  return new Map(
    [...order]
      .map((id, i) => [id, i < 40 ? 'published' : i < 44 ? 'announced' : 'none'] as const)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  )
}

/** State category names per unified category, as states spell them. */
const NAMES: Record<string, readonly string[]> = {
  'blindness-low-vision': [
    'Blindness',
    'Blindness and Visual Impairment',
    'Legal Blindness',
    'Vision Loss',
  ],
  'opioid-use-disorder': ['Opioid Use Disorder', 'OUD', 'Opioid Dependence'],
  'alcohol-use-disorder': ['Alcohol Use Disorder', 'AUD', 'Alcohol Dependence'],
  'other-substance-use': [
    'Substance Use Disorder',
    'SUD',
    'Other Substance Use Disorders',
    'Chemical Dependency',
  ],
  'serious-mental-illness': [
    'Serious Mental Illness',
    'SMI',
    'Behavioral Health',
    'Severe Mental Illness',
  ],
  'anxiety-trauma': ['Anxiety Disorders', 'PTSD and Anxiety', 'Trauma-Related Disorders'],
  dementia: ['Dementia', "Alzheimer's and Dementia", 'Neurocognitive Disorders'],
  'personality-eating': [
    'Eating Disorders',
    'Personality Disorders',
    'Personality and Eating Disorders',
  ],
  'intellectual-developmental': [
    'IDD',
    'Intellectual and Developmental Disabilities',
    'Developmental Disability',
  ],
  'paralysis-cerebral-palsy': ['Paralysis', 'Cerebral Palsy', 'Spinal Cord Injury and Paralysis'],
  'degenerative-neurological': [
    'Severe Neurological',
    'Degenerative Neurological Disease',
    "Parkinson's and MS",
  ],
  cancer: ['Cancer', 'Malignant Neoplasms', 'Active Cancer', 'Oncology'],
  'kidney-failure': [
    'ESRD',
    'End-Stage Renal Disease',
    'Kidney Failure and Dialysis',
    'ESRD + CKD',
  ],
  hiv: ['HIV/AIDS', 'HIV', 'Immunodeficiency'],
  'organ-transplant': ['Organ Transplant', 'Transplant Status', 'Transplant or Complications'],
  'heart-lung': ['Heart and Lung Disease', 'Severe Cardiac and Pulmonary', 'Heart, Liver, Lung'],
  'diabetes-complications': ['Severe Diabetes', 'Diabetes with Complications', 'Complex Diabetes'],
  epilepsy: ['Epilepsy', 'Seizure Disorders', 'Intractable Epilepsy'],
  'frailty-indicators': [
    'Functional Limitations',
    'Frailty',
    'ADL Impairment',
    'Durable Medical Equipment',
  ],
}

type Profile = 'standalone' | 'tiered' | 'unknown' | 'supporting'

export interface SyntheticState {
  source: Record<string, unknown>
  version: Record<string, unknown>
  entries: Record<string, unknown>[]
  categoryMappings: Record<string, unknown>[]
  /** `unified_id` is the target's id in the source database (make-seed looks up its slug). */
  unifiedMappings: Record<string, unknown>[]
  /** Band per unified category slug, for the report. */
  bands: Record<string, Band>
}

const MAX_PER_CATEGORY = 50

/** One synthetic published list. `index` (0, 1, …) spaces its ids from the other states'. */
export function syntheticState(
  stateId: string,
  index: number,
  ctx: SyntheticContext,
): SyntheticState {
  const rng = rngOf(`seed:${stateId}`)
  const sourceId = SYNTHETIC_IDS.source + index
  const versionId = SYNTHETIC_IDS.version + index
  const month = 1 + Math.floor(rng() * 10)
  const day = 1 + Math.floor(rng() * 28)
  const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const at = `${date}T12:00:00.000Z`

  const single = rng() < 0.25
  const subcategories = !single && rng() < 0.3
  const profile = pick<Profile>(['standalone', 'tiered', 'unknown', 'supporting'], rng)
  const basis = rng() < 0.2 ? 'inferred' : 'published'
  const bias = rng() * 2 - 1
  const weights: [Band, number][] = [
    ['high', 0.25 + 0.15 * bias],
    ['mid', 0.3],
    ['low', 0.25 - 0.1 * bias],
    ['none', 0.2 - 0.05 * bias],
  ]
  const bandOf = (): Band => {
    let x = rng() * weights.reduce((s, [, w]) => s + w, 0)
    for (const [band, w] of weights) if ((x -= w) < 0) return band
    return 'none'
  }

  const nonIcdList = ctx.nonIcd
  const usedNames = new Set<string>()
  const bands: Record<string, Band> = {}
  const chosen: { slug: string; name: string; entry: PoolEntry }[] = []
  for (const cat of ctx.categories) {
    const band = bandOf()
    bands[cat.slug] = band
    const size = ctx.universeSize.get(cat.slug) ?? 0
    const picked =
      size > 0
        ? pickForTarget(ctx.candidates.get(cat.slug) ?? [], size, band, rng, MAX_PER_CATEGORY)
            .entries
        : band === 'none'
          ? []
          : shuffle(nonIcdList, rng).slice(
              0,
              Math.max(
                1,
                Math.round(
                  (BANDS[band].lo + rng() * (BANDS[band].hi - BANDS[band].lo)) * nonIcdList.length,
                ),
              ),
            )
    const variants = NAMES[cat.slug] ?? [cat.slug]
    const name = single
      ? ''
      : (shuffle(variants, rng).find((n) => !usedNames.has(n)) ??
        `${variants[0] ?? cat.slug} (${cat.slug})`)
    usedNames.add(name)
    for (const entry of picked) chosen.push({ slug: cat.slug, name, entry })
  }

  // One list without categories holds each code pattern once.
  const seen = new Set<string>()
  const rows = chosen.filter(({ name, entry }) => {
    const key = `${name}|${poolKey(entry)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const supportingCats = new Set(ctx.categories.filter(() => rng() < 0.2).map((c) => c.slug))
  const tierOneShare = 0.4 + rng() * 0.4
  const entries = rows.map(({ slug, name, entry }, i) => {
    const icd = entry.code_system === 'icd10cm'
    const subcategory = !subcategories
      ? ''
      : !icd
        ? 'Service'
        : rng() < 0.25
          ? 'Secondary Diagnosis'
          : 'Primary Diagnosis'
    let tier: string | null = null
    let qualification = 'standalone'
    if (profile === 'unknown') qualification = 'unknown'
    if (profile === 'tiered') {
      const one = rng() < tierOneShare
      tier = one ? 'Tier 1' : 'Tier 2'
      qualification = one ? 'standalone' : 'needs_support'
    }
    if (profile === 'supporting' && (!icd || supportingCats.has(slug)))
      qualification = 'supporting_only'
    return {
      id: SYNTHETIC_IDS.entry + index * SYNTHETIC_IDS.entriesPerState + i,
      version_id: versionId,
      code_system: entry.code_system,
      raw_code: entry.raw_code,
      code_norm: entry.code_norm,
      match_kind: entry.match_kind,
      range_end_norm: entry.range_end_norm,
      includes_children: entry.includes_children,
      description_published: null,
      state_category: name,
      state_subcategory: subcategory,
      tier,
      attributes_json: null,
      qualification,
      qualification_basis: basis,
      source_document_id: sourceId,
      source_locator: null,
      source_part: '',
    }
  })
  if (entries.length >= SYNTHETIC_IDS.entriesPerState)
    throw new Error(`Too many entries for ${stateId}`)

  // Mappings, one per state category and subcategory.
  const keys = new Map<string, { slug: string; name: string; sub: string }>()
  for (const [i, e] of entries.entries()) {
    const slug = rows[i]?.slug ?? ''
    const key = `${e.state_category}|${e.state_subcategory}`
    if (!keys.has(key)) keys.set(key, { slug, name: e.state_category, sub: e.state_subcategory })
  }
  const sorted = [...keys.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v)
  const federalOf = new Map(ctx.categories.map((c) => [c.slug, c]))
  const mappingBase = index * 100
  const categoryMappings = sorted
    .filter((k) => k.name !== '')
    .map((k, i) => ({
      id: SYNTHETIC_IDS.categoryMapping + mappingBase + i,
      state_id: stateId,
      state_category: k.name,
      state_subcategory: k.sub,
      federal_category: federalOf.get(k.slug)?.federal_category ?? 'unmapped',
      method: 'manual',
      confidence: null,
      mapped_by: ctx.actor,
      mapped_at: at,
    }))
  const approved = (relation: string, target: number | null, k: { name: string; sub: string }) => ({
    state_id: stateId,
    state_category: k.name,
    state_subcategory: k.sub,
    unified_id: target,
    relation,
    basis: relation === 'by_code' ? 'ccsr_agreement' : 'state_text',
    confidence: 'high',
    rationale: null,
    citation: null,
    mapped_by: ctx.actor,
    mapped_at: at,
    reviewed_by: ctx.actor,
    reviewed_at: at,
    status: 'approved',
    superseded_by: null,
  })
  const mapped = single
    ? rng() < 0.7
      ? [approved('by_code', null, { name: '', sub: '' })]
      : []
    : sorted.flatMap((k) =>
        rng() < 0.7 ? [approved('exact', federalOf.get(k.slug)?.id ?? null, k)] : [],
      )
  const unifiedMappings = mapped.map((m, i) => ({
    id: SYNTHETIC_IDS.unifiedMapping + mappingBase + i,
    ...m,
  }))

  const source = {
    id: sourceId,
    state_id: stateId,
    title: SYNTHETIC_TITLE,
    url: null,
    publisher_date: date,
    retrieved_at: at,
    file_type: 'pdf',
    sha256: createHash('sha256').update(`seed/${stateId}`).digest('hex'),
    r2_key: `seed/${stateId}`,
    byte_size: 0,
    uploaded_by: ctx.actor,
  }
  const version = {
    id: versionId,
    state_id: stateId,
    version_no: 1,
    status: 'published',
    label: 'Synthetic test list',
    effective_date: date,
    state_published_date: date,
    content_updated_at: at,
    created_by: ctx.actor,
    created_at: at,
    published_by: ctx.actor,
    published_at: at,
    check_report_json: null,
    row_count: entries.length,
  }
  return { source, version, entries, categoryMappings, unifiedMappings, bands }
}
