import { z } from 'zod'

import { federalCategoryInfo } from './categories'
import { MAX_CELL_LENGTH } from './codes'
import type { FederalCategory } from './enums'

// A state's own federal category for a row (docs/data-model.md, "Federal categories", rule 1).
// Some states publish, per code, which of the five categories in the law it falls under
// (Indiana's "Federal category" column). The ingest column role `stateFederal` reads that cell;
// this file turns its text into enum values. Stored as `entries.state_federal_categories`: the
// values in federal order joined by "," (NULL for none).

/** The five categories in the law: a state can name only these, not our own two. */
export const lawCategories = [
  'blind_or_disabled',
  'sud',
  'disabling_mental_disorder',
  'physical_idd_adl',
  'serious_complex_medical',
] as const satisfies readonly FederalCategory[]
export const lawCategorySchema = z.enum(lawCategories)
export type LawCategory = z.infer<typeof lawCategorySchema>

/** A row's state-published federal categories: law categories, each once. */
export const stateFederalCategoriesSchema = z
  .array(lawCategorySchema)
  .min(1)
  .max(lawCategories.length)
  .refine((list) => new Set(list).size === list.length, { message: 'Each category once' })

/** Lower case, "&" read as "and", punctuation dropped, single spaces, no leading "with a". */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(with a|with an|with|who is) /, '')

/** The wordings states use, besides our label and the law's words (normalized at load). */
const VARIANTS: Record<LawCategory, string[]> = {
  blind_or_disabled: ['blind and disabled', 'blind disabled', 'blindness or disability'],
  sud: ['substance use disorders', 'sud'],
  disabling_mental_disorder: ['disabling mental disorders'],
  physical_idd_adl: [
    'physical intellectual or developmental disabilities',
    'physical intellectual and developmental disability',
    'physical intellectual and developmental disabilities',
  ],
  serious_complex_medical: [
    'serious or complex medical conditions',
    'serious and complex medical condition',
    'serious and complex medical conditions',
  ],
}

const KNOWN = new Map<string, LawCategory>()
for (const category of lawCategories) {
  const info = federalCategoryInfo[category]
  for (const text of [info.label, info.statuteText, ...VARIANTS[category]]) {
    KNOWN.set(normalize(text), category)
  }
}

const cellSchema = z.string().max(MAX_CELL_LENGTH)

/**
 * Reads a state's federal category cell: parts split on ";", each matched against the five
 * categories ignoring case and punctuation. `unknown` holds the parts it could not read (a
 * review flag); an empty cell gives none.
 */
export function parseStateFederalCell(text: string): {
  categories: LawCategory[]
  unknown: string[]
} {
  const found = new Set<LawCategory>()
  const unknown: string[] = []
  for (const part of cellSchema.parse(text.slice(0, MAX_CELL_LENGTH)).split(';')) {
    const trimmed = part.trim()
    if (trimmed === '') continue
    const category = KNOWN.get(normalize(trimmed))
    if (category) found.add(category)
    else unknown.push(trimmed)
  }
  return { categories: lawCategories.filter((c) => found.has(c)), unknown }
}

/** The stored form: values in the given order joined by ",", or null for none. */
export function encodeStateFederal(list: readonly LawCategory[] | undefined): string | null {
  return list === undefined || list.length === 0 ? null : list.join(',')
}

/** Reads the stored form; anything that is not a law category is dropped. */
export function decodeStateFederal(text: string | null | undefined): LawCategory[] {
  if (text === null || text === undefined || text === '') return []
  const known = new Set<string>(lawCategories)
  const listed = new Set(text.split(',').filter((v): v is LawCategory => known.has(v)))
  return lawCategories.filter((c) => listed.has(c))
}
