// AHRQ's DXCCSR mapping file → `ref_ccsr_categories` and `ref_ccsr` (docs/data-model.md, "CCSR
// reference data").
//
// Source: Clinical Classifications Software Refined (CCSR) for ICD-10-CM Diagnoses, v2026.1.
// Healthcare Cost and Utilization Project (HCUP). Agency for Healthcare Research and Quality,
// Rockville, MD. https://hcup-us.ahrq.gov/toolssoftware/ccsr/dxccsr.jsp
//
// AHRQ states no licence for the file, so it is never committed: the build downloads it into
// .cache/ and writes only to dist/ (both gitignored). The test fixture is synthetic.
//
// File layout (v2026.1): CSV, CRLF, ASCII, one row per ICD-10-CM code (no dot). Codes and
// category ids are in single quotes (`'F200'`, `'MBD002'`; an empty slot is `' '`); text with a
// comma is in double quotes. 19 columns: code, description, inpatient default and its
// description, outpatient default and its description, six category/description pairs, and the
// rationale for the default.

import { CCSR_CATEGORY_PATTERN, CCSR_MIN_PREFIX } from '@mfcd/shared/ccsr'

/** One code from the file: its 1–6 CCSR categories and the inpatient default. */
export interface CcsrCode {
  codeNorm: string
  categories: string[]
  /** NULL when the inpatient default is XXX000 ("unacceptable principal diagnosis"). */
  defaultCategory: string | null
}

export interface CcsrCategoryRow {
  ccsrCategory: string
  description: string
  /** The body system's name (`MBD` → "Mental, behavioral, …"), or the prefix if unknown. */
  bodySystem: string
  release: string
}

export interface RefCcsrRow {
  /** An ICD-10-CM code or a prefix of 3+ characters (see `compressCcsr`). */
  codeNorm: string
  ccsrCategory: string
  isDefault: 0 | 1
  release: string
}

const HEADER = [
  'ICD-10-CM CODE',
  'ICD-10-CM CODE DESCRIPTION',
  'Default CCSR CATEGORY IP',
  'Default CCSR CATEGORY DESCRIPTION IP',
  'Default CCSR CATEGORY OP',
  'Default CCSR CATEGORY DESCRIPTION OP',
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
    `CCSR CATEGORY ${String(n)}`,
    `CCSR CATEGORY ${String(n)} DESCRIPTION`,
  ]),
  'Rationale for Default Assignment',
]

/** The inpatient default for codes that may not be a principal diagnosis (user guide, App. C). */
const UNACCEPTABLE_PDX = 'XXX000'

// User guide v2026.1, Table 1 ("Three-Character Abbreviation for ICD-10-CM Body Systems").
// The names follow the ICD-10-CM chapter titles; the CSV itself does not carry them.
const BODY_SYSTEMS: Readonly<Record<string, string>> = {
  BLD: 'Diseases of the blood and blood-forming organs and certain disorders involving the immune mechanism',
  CIR: 'Diseases of the circulatory system',
  DEN: 'Dental diseases',
  DIG: 'Diseases of the digestive system',
  EAR: 'Diseases of the ear and mastoid process',
  END: 'Endocrine, nutritional, and metabolic diseases',
  EXT: 'External causes of morbidity',
  EYE: 'Diseases of the eye and adnexa',
  FAC: 'Factors influencing health status and contact with health services',
  GEN: 'Diseases of the genitourinary system',
  INF: 'Certain infectious and parasitic diseases',
  INJ: 'Injury, poisoning and certain other consequences of external causes',
  MAL: 'Congenital malformations, deformations and chromosomal abnormalities',
  MBD: 'Mental, behavioral, and neurodevelopmental disorders',
  MUS: 'Diseases of the musculoskeletal system and connective tissue',
  NEO: 'Neoplasms',
  NVS: 'Diseases of the nervous system',
  PNL: 'Certain conditions originating in the perinatal period',
  PRG: 'Pregnancy, childbirth, and the puerperium',
  RSP: 'Diseases of the respiratory system',
  SKN: 'Diseases of the skin and subcutaneous tissue',
  SYM: 'Symptoms, signs and abnormal clinical and laboratory findings, not elsewhere classified',
}

export function bodySystemName(prefix: string): string {
  return BODY_SYSTEMS[prefix] ?? prefix
}

/** Splits one CSV line: double quotes group text with commas (`""` is a quote). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let i = 0
  for (;;) {
    let field = ''
    if (line[i] === '"') {
      i++
      for (;;) {
        const close = line.indexOf('"', i)
        if (close < 0) throw new Error('unterminated quoted field')
        field += line.slice(i, close)
        i = close + 1
        if (line[i] !== '"') break
        field += '"'
        i++
      }
      if (i < line.length && line[i] !== ',') throw new Error('text after a quoted field')
    } else {
      const comma = line.indexOf(',', i)
      const end = comma < 0 ? line.length : comma
      field = line.slice(i, end)
      i = end
    }
    fields.push(field.trim())
    if (i >= line.length) return fields
    i++ // the comma
  }
}

/** `'F200'` → `F200`; `' '` → ``. */
function unquote(field: string): string {
  return field.length >= 2 && field.startsWith("'") && field.endsWith("'")
    ? field.slice(1, -1).trim()
    : field
}

const CODE = /^[A-Z][0-9A-Z]{2,6}$/

export function parseDxccsrCsv(
  text: string,
  options: { release: string },
): { codes: CcsrCode[]; categories: CcsrCategoryRow[] } {
  const lines = text.split(/\r?\n/)
  const header = splitCsvLine(lines[0] ?? '').map(unquote)
  if (header.join('|') !== HEADER.join('|')) {
    throw new Error(`DXCCSR header changed: ${header.join(', ')}`)
  }
  const codes: CcsrCode[] = []
  const descriptions = new Map<string, string>()
  const seen = new Set<string>()
  lines.slice(1).forEach((line, index) => {
    if (line.trim() === '') return
    const where = `DXCCSR line ${String(index + 2)}`
    const fields = splitCsvLine(line)
    if (fields.length !== HEADER.length) {
      throw new Error(
        `${where}: ${String(fields.length)} fields, expected ${String(HEADER.length)} fields`,
      )
    }
    const codeNorm = unquote(fields[0] ?? '')
    if (!CODE.test(codeNorm)) throw new Error(`${where}: bad ICD-10-CM code ${codeNorm}`)
    const categories: string[] = []
    for (let slot = 6; slot < 18; slot += 2) {
      const category = unquote(fields[slot] ?? '')
      if (category === '') continue
      if (!CCSR_CATEGORY_PATTERN.test(category)) {
        throw new Error(`${where}: bad CCSR category ${category}`)
      }
      const description = fields[slot + 1] ?? ''
      const known = descriptions.get(category)
      if (known !== undefined && known !== description) {
        throw new Error(`${where}: ${category} is "${description}" here, "${known}" before`)
      }
      descriptions.set(category, description)
      categories.push(category)
    }
    if (categories.length === 0) throw new Error(`${where}: ${codeNorm} has no CCSR category`)
    const inpatient = unquote(fields[2] ?? '')
    if (inpatient !== UNACCEPTABLE_PDX && !categories.includes(inpatient)) {
      throw new Error(`${where}: ${codeNorm}'s default ${inpatient} is not one of its categories`)
    }
    if (seen.has(codeNorm)) throw new Error(`${where}: ${codeNorm} is listed twice`)
    seen.add(codeNorm)
    codes.push({
      codeNorm,
      categories,
      defaultCategory: inpatient === UNACCEPTABLE_PDX ? null : inpatient,
    })
  })
  const categories = [...descriptions]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([ccsrCategory, description]) => ({
      ccsrCategory,
      description,
      bodySystem: bodySystemName(ccsrCategory.slice(0, 3)),
      release: options.release,
    }))
  return { codes, categories }
}

const signature = (code: CcsrCode) =>
  `${[...code.categories].sort().join(',')}|${code.defaultCategory ?? ''}`

/**
 * One row per CCSR category, keyed by the shortest prefix (3+ characters) under which every code
 * in the file has the same categories and default. `ccsrGroupsOf` in packages/shared reads it
 * back by longest-prefix match, which returns each code's own groups:
 *
 * - Chosen prefixes never nest: if a shorter one were uniform, every code under the longer one
 *   would have chosen it.
 * - CCSR keeps old codes that later became headers (`B880` beside the newer `B8801`, `B8809`).
 *   When such a code's groups differ from those below it, no prefix of it is uniform, so it keeps
 *   its own key; the codes below it choose keys longer than it, which the lookup tries first.
 */
export function compressCcsr(codes: readonly CcsrCode[], release: string): RefCcsrRow[] {
  const MIXED = '\u0000mixed'
  const byPrefix = new Map<string, string>()
  for (const code of codes) {
    const sig = signature(code)
    for (let length = CCSR_MIN_PREFIX; length <= code.codeNorm.length; length++) {
      const prefix = code.codeNorm.slice(0, length)
      const seen = byPrefix.get(prefix)
      byPrefix.set(prefix, seen === undefined || seen === sig ? sig : MIXED)
    }
  }
  const chosen = new Map<string, CcsrCode>()
  for (const code of codes) {
    let key = code.codeNorm // an old code with different groups below it keeps its own key
    for (let length = CCSR_MIN_PREFIX; length <= code.codeNorm.length; length++) {
      const prefix = code.codeNorm.slice(0, length)
      if (byPrefix.get(prefix) !== MIXED) {
        key = prefix
        break
      }
    }
    if (!chosen.has(key)) chosen.set(key, code)
  }
  return [...chosen]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([prefix, code]) =>
      [...code.categories].sort().map((ccsrCategory) => ({
        codeNorm: prefix,
        ccsrCategory,
        isDefault: ccsrCategory === code.defaultCategory ? (1 as const) : (0 as const),
        release,
      })),
    )
}
