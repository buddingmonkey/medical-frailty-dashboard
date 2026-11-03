// Federal categories and the keyword table that suggests one for a state's own category label
// (docs/ingestion.md, "Category auto-mapping"). A suggestion is only a suggestion: it is stored
// with method 'auto' and shows as unconfirmed in the admin until someone confirms it.
import type { FederalCategory } from './enums'

/**
 * The statute: Social Security Act §1902(xx)(9)(A)(ii)(V), added by Public Law 119-21 (H.R.1,
 * 2025) §71119. A "specified excluded individual" includes one "who is medically frail or
 * otherwise has special medical needs (as defined by the Secretary), including an individual"
 * in clauses (aa)–(ee). Text checked against the enrolled law on govinfo, 2026-11-01:
 * https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm
 */
export const STATUTE_CITATION =
  'Social Security Act §1902(xx)(9)(A)(ii)(V), added by Pub. L. 119-21 §71119'
export const STATUTE_URL =
  'https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm'

export interface FederalCategoryInfo {
  /** Short public label. Provisional: the legal team may reword it (docs/status.md). */
  label: string
  /** `(aa)`–`(ee)` for the statutory categories; null for our own. */
  statuteClause: string | null
  /** The clause verbatim, or our own description. */
  statuteText: string
}

export const federalCategoryInfo: Record<FederalCategory, FederalCategoryInfo> = {
  blind_or_disabled: {
    label: 'Blind or disabled',
    statuteClause: '(aa)',
    statuteText: 'who is blind or disabled (as defined in section 1614)',
  },
  sud: {
    label: 'Substance use disorder',
    statuteClause: '(bb)',
    statuteText: 'with a substance use disorder',
  },
  disabling_mental_disorder: {
    label: 'Disabling mental disorder',
    statuteClause: '(cc)',
    statuteText: 'with a disabling mental disorder',
  },
  physical_idd_adl: {
    label: 'Physical, intellectual or developmental disability',
    statuteClause: '(dd)',
    statuteText:
      'with a physical, intellectual or developmental disability that significantly impairs their ability to perform 1 or more activities of daily living',
  },
  serious_complex_medical: {
    label: 'Serious or complex medical condition',
    statuteClause: '(ee)',
    statuteText: 'with a serious or complex medical condition',
  },
  state_specific: {
    label: 'State’s own category (not in the law)',
    statuteClause: null,
    statuteText: 'The state uses a category that does not fit the five groups in the law.',
  },
  unmapped: {
    label: 'Not yet classified',
    statuteClause: null,
    statuteText: 'This site has not yet assigned a federal category to these entries.',
  },
}

/**
 * The law's own words for a statutory category (the short label drops some of them, such as
 * the activities of daily living in (dd)); null for the two that are not in the law.
 */
export function federalCategoryClauseText(category: FederalCategory): string | null {
  const info = federalCategoryInfo[category]
  return info.statuteClause === null
    ? null
    : `Clause ${info.statuteClause} of the law: “an individual ${info.statuteText}”`
}

/** The link text beside the law's words; the link goes to `STATUTE_URL`. */
export const STATUTE_LINK_TEXT = 'Read the law'

/**
 * The labels of the federal categories a code counts under, `; ` between them (a code in two
 * unified categories with different federal parents counts under both).
 */
export const federalCategoriesText = (list: readonly FederalCategory[]): string =>
  list.map((f) => federalCategoryInfo[f].label).join('; ')

/** Lowercase, punctuation to spaces, single spaces: `SID-SDD-SPD` → `sid sdd spd`. */
export function normalizeCategoryLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface Keyword {
  keyword: string
  /**
   * `token`: a whole word (`sud`); `prefix`: the start of a word (`neurolog` in
   * "neurological"; not `immun` in "community"); `label`: the whole label (`b`).
   */
  match: 'token' | 'prefix' | 'label'
  category: FederalCategory
}

const k = (category: FederalCategory, match: Keyword['match'], ...keywords: string[]): Keyword[] =>
  keywords.map((keyword) => ({ keyword, match, category }))

/**
 * In priority order: when keywords for different categories match, the first one wins (with a
 * lower confidence). State-specific phrases come first so "Temporary disabling" is not read as
 * "disabled"; blind-or-disabled comes last so "developmental disability" stays under (dd).
 */
const KEYWORDS: readonly Keyword[] = [
  ...k('state_specific', 'prefix', 'temporar', 'ability to work', 'frailty indicator'),
  ...k('sud', 'token', 'sud'),
  ...k('sud', 'prefix', 'substance'),
  ...k('disabling_mental_disorder', 'token', 'smi', 'dmd'),
  ...k('disabling_mental_disorder', 'prefix', 'mental'),
  ...k('physical_idd_adl', 'token', 'idd', 'sid', 'sdd', 'spd', 'adl'),
  ...k('physical_idd_adl', 'prefix', 'developmental', 'intellectual', 'activities of daily living'),
  ...k('serious_complex_medical', 'token', 'scmc', 'esrd'),
  ...k(
    'serious_complex_medical',
    'prefix',
    'serious or complex',
    'cancer',
    'transplant',
    'diabetes',
    'neurolog',
    'immun',
    'autoimmun',
    'infectious',
  ),
  ...k('blind_or_disabled', 'label', 'b'),
  ...k('blind_or_disabled', 'prefix', 'blind', 'disabled', 'disability'),
]

function matches(text: string, { keyword, match }: Keyword): boolean {
  switch (match) {
    case 'label':
      return text === keyword
    case 'token':
      return text.split(' ').includes(keyword)
    case 'prefix':
      return ` ${text}`.includes(` ${keyword}`)
  }
}

export interface AutoMapping {
  federalCategory: FederalCategory
  /** The keyword that decided it, shown to the admin. */
  keyword: string
  /** 0.9 whole word, 0.7 start of a word, 0.5 when other keywords disagree. */
  confidence: number
}

function mapLabel(label: string): AutoMapping | null {
  const text = normalizeCategoryLabel(label)
  if (text === '') return null
  const hits = KEYWORDS.filter((kw) => matches(text, kw))
  const [first] = hits
  if (!first) return null
  const disagree = hits.some((hit) => hit.category !== first.category)
  return {
    federalCategory: first.category,
    keyword: first.keyword,
    confidence: disagree ? 0.5 : first.match === 'prefix' ? 0.7 : 0.9,
  }
}

/**
 * Suggests a federal category for a state's category label (and subcategory, used only when
 * the category alone matches nothing). Null means "unmapped": we never guess beyond the table.
 * Not for states that group codes only by ICD chapter (NE, GA): an ICD chapter heading is not a
 * frailty category, so those states use a per-state default set by an admin.
 */
export function autoMapCategory(category: string, subcategory = ''): AutoMapping | null {
  return mapLabel(category) ?? mapLabel(subcategory)
}
