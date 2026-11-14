import { z } from 'zod'

import { federalCategoriesText, federalCategoryInfo } from './categories'
import { categoryLabel, chosenCategory, federalCategoriesOf, mappingKey } from './category-mapping'
import { type CodeSystem, type FederalCategory, federalCategories } from './enums'
import { icd10cmChapterOf, icd10cmChapters } from './icd-chapters'

// Bulk remap with a preview (roadmap M7 step 3; docs/ingestion.md, "Category auto-mapping").
// The preview applies the one federal-category rule (`federalCategoriesOf`) to every published
// entry of the state, before and after the proposed changes, so it says honestly which entries
// move and which stay: an entry placed in a published unified category keeps that category's
// federal parent, an ICD-10-CM entry under a chapter override keeps the override, and an entry
// whose state published its federal category keeps that.

const SAMPLE_SIZE = 20

const chapterNumber = z
  .number()
  .int()
  .refine((n) => icd10cmChapters.some((c) => c.number === n), 'Unknown chapter')

const changesShape = {
  categories: z
    .array(
      z.object({
        stateCategory: categoryLabel,
        stateSubcategory: categoryLabel,
        federalCategory: chosenCategory,
      }),
    )
    .max(200),
  /** null removes the override, so the chapter's entries use their category mapping again. */
  chapters: z
    .array(z.object({ chapter: chapterNumber, federalCategory: chosenCategory.nullable() }))
    .max(icd10cmChapters.length),
}

function checkChanges(
  value: {
    categories: { stateCategory: string; stateSubcategory: string }[]
    chapters: { chapter: number }[]
  },
  ctx: z.RefinementCtx,
) {
  if (value.categories.length + value.chapters.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Choose at least one change' })
  }
  const keys = value.categories.map((c) => mappingKey(c.stateCategory, c.stateSubcategory))
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: 'custom', message: 'A category appears twice' })
  }
  if (new Set(value.chapters.map((c) => c.chapter)).size !== value.chapters.length) {
    ctx.addIssue({ code: 'custom', message: 'A chapter appears twice' })
  }
}

/** Body of `POST /api/admin/states/:stateId/categories/preview`. */
export const remapChangesSchema = z.object(changesShape).superRefine(checkChanges)
export type RemapChanges = z.infer<typeof remapChangesSchema>

/** Body of `POST /api/admin/states/:stateId/categories/remap`: the changes and the preview's token. */
export const remapSaveSchema = z
  .object({ ...changesShape, token: z.string().min(1).max(128) })
  .superRefine(checkChanges)

const federal = z.enum(federalCategories)

const remapChange = z.object({
  kind: z.enum(['category', 'chapter']),
  /** For a category change; '' for a chapter change. */
  stateCategory: z.string(),
  stateSubcategory: z.string(),
  /** For a chapter change; null for a category change. */
  chapter: z.number().int().nullable(),
  /** The new federal category; null when a chapter override is removed. */
  to: federal.nullable(),
  /** Published entries the change covers (in the category, or ICD-10-CM codes in the chapter). */
  entries: z.number().int().nonnegative(),
  /** Entries that change federal category, grouped by from → to. */
  moves: z.array(z.object({ from: federal, to: federal, n: z.number().int().positive() })),
  movingTotal: z.number().int().nonnegative(),
  /** Entries whose federal category is already the new one. */
  already: z.number().int().nonnegative(),
  alreadyIn: z.array(federal),
  /** Entries that stay because the state published their federal category, and under what. */
  stated: z.object({ n: z.number().int().nonnegative(), federal: z.array(federal) }),
  /** Entries that stay because a published unified placement wins, and under what. */
  placed: z.object({ n: z.number().int().nonnegative(), federal: z.array(federal) }),
  /** Category changes only: ICD-10-CM entries that stay because a chapter override wins. */
  chapterOverride: z.array(
    z.object({ chapter: z.number().int(), federalCategory: federal, n: z.number().int() }),
  ),
  /** Up to 20 of the moving entries, as the state published them. */
  sample: z.array(
    z.object({
      code: z.string(),
      description: z.string().nullable(),
      from: z.array(federal),
      to: z.array(federal),
    }),
  ),
  /** Entries in open drafts the change also covers (mappings belong to the state). */
  draftEntries: z.number().int().nonnegative(),
})
export type RemapChange = z.infer<typeof remapChange>

/** Response of the preview; `token` goes back with the save, which refuses a stale one (409). */
export const remapPreviewResponseSchema = z.object({
  token: z.string(),
  changes: z.array(remapChange),
  /** Published entries per federal category, before → after (an entry can count under two). */
  totals: z.array(
    z.object({
      federalCategory: federal,
      before: z.number().int().nonnegative(),
      after: z.number().int().nonnegative(),
    }),
  ),
})
export type RemapPreview = z.infer<typeof remapPreviewResponseSchema>

/** A published entry, with the federal parents of its published unified placements. */
export interface RemapEntry {
  codeSystem: CodeSystem
  codeNorm: string
  rawCode: string
  description: string | null
  stateCategory: string
  stateSubcategory: string
  unifiedParents: readonly FederalCategory[]
  /** The state's own federal categories for the entry (they win over everything). */
  stateFederalCategories?: readonly FederalCategory[]
}

/** Open-draft entries counted by category and ICD-10-CM three-character category ('' if none). */
export interface RemapDraftGroup {
  stateCategory: string
  stateSubcategory: string
  icd: string
  n: number
}

const chapterOf = (e: { codeSystem: CodeSystem; codeNorm: string }) =>
  e.codeSystem === 'icd10cm' ? (icd10cmChapterOf(e.codeNorm)?.number ?? null) : null

/** The preview of a remap, without its token (the API adds it). */
export function previewRemap(input: {
  entries: readonly RemapEntry[]
  mappings: ReadonlyMap<string, FederalCategory>
  chapterOverrides: ReadonlyMap<number, FederalCategory>
  changes: RemapChanges
  draftGroups: readonly RemapDraftGroup[]
}): Omit<RemapPreview, 'token'> {
  const { entries, mappings, chapterOverrides, changes } = input
  const afterMappings = new Map(mappings)
  for (const c of changes.categories) {
    afterMappings.set(mappingKey(c.stateCategory, c.stateSubcategory), c.federalCategory)
  }
  const afterChapters = new Map(chapterOverrides)
  for (const c of changes.chapters) {
    if (c.federalCategory === null) afterChapters.delete(c.chapter)
    else afterChapters.set(c.chapter, c.federalCategory)
  }

  const rows = entries.map((e) => ({
    e,
    key: mappingKey(e.stateCategory, e.stateSubcategory),
    chapter: chapterOf(e),
    before: federalCategoriesOf(e, e.unifiedParents, mappings, chapterOverrides),
    after: federalCategoriesOf(e, e.unifiedParents, afterMappings, afterChapters),
  }))

  const before = new Map<FederalCategory, number>()
  const after = new Map<FederalCategory, number>()
  for (const r of rows) {
    for (const f of r.before) before.set(f, (before.get(f) ?? 0) + 1)
    for (const f of r.after) after.set(f, (after.get(f) ?? 0) + 1)
  }

  const describe = (
    covered: typeof rows,
    base: Pick<RemapChange, 'kind' | 'stateCategory' | 'stateSubcategory' | 'chapter' | 'to'>,
    draftEntries: number,
  ): RemapChange => {
    const moves = new Map<string, { from: FederalCategory; to: FederalCategory; n: number }>()
    const placedFederal = new Set<FederalCategory>()
    const statedFederal = new Set<FederalCategory>()
    let stated = 0
    const alreadyIn = new Set<FederalCategory>()
    const overrides = new Map<
      number,
      { chapter: number; federalCategory: FederalCategory; n: number }
    >()
    const sample: RemapChange['sample'] = []
    let placed = 0
    let already = 0
    let movingTotal = 0
    for (const r of covered) {
      if ((r.e.stateFederalCategories ?? []).length > 0) {
        stated += 1
        for (const f of r.before) statedFederal.add(f)
        continue
      }
      if (r.e.unifiedParents.length > 0) {
        placed += 1
        for (const f of r.before) placedFederal.add(f)
        continue
      }
      const override = r.chapter === null ? undefined : afterChapters.get(r.chapter)
      if (base.kind === 'category' && r.chapter !== null && override) {
        const o = overrides.get(r.chapter) ?? {
          chapter: r.chapter,
          federalCategory: override,
          n: 0,
        }
        o.n += 1
        overrides.set(r.chapter, o)
        continue
      }
      const from = r.before[0] ?? 'unmapped'
      const to = r.after[0] ?? 'unmapped'
      if (from === to) {
        already += 1
        alreadyIn.add(to)
        continue
      }
      movingTotal += 1
      const key = `${from}>${to}`
      const m = moves.get(key) ?? { from, to, n: 0 }
      m.n += 1
      moves.set(key, m)
      if (sample.length < SAMPLE_SIZE) {
        sample.push({
          code: r.e.rawCode,
          description: r.e.description,
          from: r.before,
          to: r.after,
        })
      }
    }
    return {
      ...base,
      entries: covered.length,
      moves: [...moves.values()],
      movingTotal,
      already,
      alreadyIn: federalCategories.filter((f) => alreadyIn.has(f)),
      stated: { n: stated, federal: federalCategories.filter((f) => statedFederal.has(f)) },
      placed: { n: placed, federal: federalCategories.filter((f) => placedFederal.has(f)) },
      chapterOverride: [...overrides.values()].sort((a, b) => a.chapter - b.chapter),
      sample,
      draftEntries,
    }
  }

  const draftChapter = (g: RemapDraftGroup) =>
    g.icd === '' ? null : (icd10cmChapterOf(g.icd)?.number ?? null)
  const sum = (groups: readonly RemapDraftGroup[]) => groups.reduce((n, g) => n + g.n, 0)

  return {
    changes: [
      ...changes.categories.map((c) => {
        const key = mappingKey(c.stateCategory, c.stateSubcategory)
        return describe(
          rows.filter((r) => r.key === key),
          {
            kind: 'category',
            stateCategory: c.stateCategory,
            stateSubcategory: c.stateSubcategory,
            chapter: null,
            to: c.federalCategory,
          },
          sum(
            input.draftGroups.filter(
              (g) => mappingKey(g.stateCategory, g.stateSubcategory) === key,
            ),
          ),
        )
      }),
      ...changes.chapters.map((c) =>
        describe(
          rows.filter((r) => r.chapter === c.chapter),
          {
            kind: 'chapter',
            stateCategory: '',
            stateSubcategory: '',
            chapter: c.chapter,
            to: c.federalCategory,
          },
          sum(input.draftGroups.filter((g) => draftChapter(g) === c.chapter)),
        ),
      ),
    ],
    totals: federalCategories
      .map((f) => ({ federalCategory: f, before: before.get(f) ?? 0, after: after.get(f) ?? 0 }))
      .filter((t) => t.before > 0 || t.after > 0),
  }
}

const label = (f: FederalCategory) => federalCategoryInfo[f].label
const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/** The confirm step's sentences for one change (admin wording, not public). */
export function remapChangeSentences(change: RemapChange): string[] {
  const lines: string[] = []
  if (change.movingTotal === 0) lines.push('No published entry changes federal category.')
  for (const m of change.moves) {
    lines.push(
      `${count(m.n, 'entry', 'entries')} will move from ${label(m.from)} to ${label(m.to)}.`,
    )
  }
  if (change.already > 0) {
    lines.push(
      `${count(change.already, 'is', 'are')} already in ${federalCategoriesText(change.alreadyIn)}.`,
    )
  }
  if (change.stated.n > 0) {
    const verb = change.stated.n === 1 ? 'stays' : 'stay'
    lines.push(
      `${change.stated.n.toLocaleString('en-US')} ${verb} in ${federalCategoriesText(change.stated.federal)} because the state’s list names that federal category.`,
    )
  }
  if (change.placed.n > 0) {
    const verb = change.placed.n === 1 ? 'stays' : 'stay'
    const pronoun = change.placed.n === 1 ? 'it is' : 'they are'
    lines.push(
      `${change.placed.n.toLocaleString('en-US')} ${verb} in ${federalCategoriesText(change.placed.federal)} because ${pronoun} placed in a published unified category.`,
    )
  }
  for (const o of change.chapterOverride) {
    lines.push(
      `${o.n.toLocaleString('en-US')} ${o.n === 1 ? 'stays' : 'stay'} in ${label(o.federalCategory)} because the override for ICD-10-CM chapter ${String(o.chapter)} wins.`,
    )
  }
  if (change.draftEntries > 0) {
    lines.push(`And ${count(change.draftEntries, 'entry', 'entries')} in open drafts.`)
  }
  return lines
}
