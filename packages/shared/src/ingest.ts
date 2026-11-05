import { z } from 'zod'

import { stateIdSchema } from './admin'
import { MAX_CELL_LENGTH } from './codes'
import {
  type Qualification,
  type QualificationBasis,
  qualificationBasisSchema,
  qualificationSchema,
} from './enums'

// Parsed tables and column mapping (docs/ingestion.md, steps 3 and 4). Adapters in the browser
// turn a file into RawTables; a column profile says what each column means.

/** One row of cells, with where it came from ("Sheet1 row 12", "page 3 line 4"). */
export interface RawRow {
  cells: string[]
  locator: string
}

/** One sheet, file or PDF page group. `header` is the column names. */
export interface RawTable {
  name: string
  header: string[]
  rows: RawRow[]
}

/** Limits from docs/ingestion.md, "Parser adapters". */
export const MAX_ROWS = 100_000
export const MAX_COLUMNS = 100

export const columnRoles = [
  'code',
  'codeSystem',
  'description',
  'category',
  'subcategory',
  'tier',
  'qualification',
  'included',
  'notes',
  'ignore',
] as const
export const columnRoleSchema = z.enum(columnRoles)
export type ColumnRole = z.infer<typeof columnRoleSchema>

export const columnRoleLabels: Record<ColumnRole, string> = {
  code: 'Code',
  codeSystem: 'Code system',
  description: 'Description',
  category: 'Category',
  subcategory: 'Subcategory',
  tier: 'Tier',
  qualification: 'Qualification',
  included: 'Included (Yes/No)',
  notes: 'Notes / rationale',
  ignore: 'Ignore',
}

// First match wins, so the more specific patterns ("Code Type", "Code Name") come before "Code".
const ROLE_PATTERNS: [RegExp, ColumnRole][] = [
  [/designation|qualif/, 'qualification'],
  [/tier/, 'tier'],
  [/^(yes ?\/ ?no|included?|frail)$/, 'included'],
  [/rationale|notes?\b|comment/, 'notes'],
  [/sub-?\s?categ/, 'subcategory'],
  [/categ/, 'category'],
  [/condition name/, 'subcategory'],
  [/code ?(type|system)|type of code/, 'codeSystem'],
  [/desc|code name|definition/, 'description'],
  [/\bcodes?\b|^icd|^cpt|^hcpcs/, 'code'],
]

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ')

/** Best guess of each column's role from its header. Each role goes to its first column. */
export function guessColumnRoles(header: readonly string[]): ColumnRole[] {
  const taken = new Set<ColumnRole>()
  return header.map((h) => {
    const text = normalizeHeader(h).slice(0, 200)
    const role = ROLE_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? 'ignore'
    if (role === 'ignore' || taken.has(role)) return 'ignore'
    taken.add(role)
    return role
  })
}

/** Identifies a header layout, so a saved profile is found again for the same layout. */
export function headerKey(header: readonly string[]): string {
  return header.map(normalizeHeader).join('|')
}

const qualificationRule = z.discriminatedUnion('mode', [
  /** One value for every row in the file. */
  z.object({
    mode: z.literal('fixed'),
    value: qualificationSchema,
    basis: qualificationBasisSchema,
  }),
  /** From a column's value, per tier (MT) or per designation (LA 0/1/2). */
  z.object({
    mode: z.literal('column'),
    from: z.enum(['qualification', 'tier']),
    values: z.record(z.string().max(200), qualificationSchema),
    basis: qualificationBasisSchema,
  }),
])

/** What each column means, saved per state and header layout. `roles[i]` is column i. */
export const columnProfileSchema = z
  .object({
    roles: z.array(columnRoleSchema).min(1).max(MAX_COLUMNS),
    qualification: qualificationRule,
    /** Category for every row when the file has no category column (e.g. Georgia). */
    defaultCategory: z.string().trim().max(200).default(''),
    /** Tier for every row when the file has no tier column (GA: one file per tier). */
    defaultTier: z.string().trim().max(200).default(''),
  })
  .superRefine((profile, ctx) => {
    const count = (role: ColumnRole) => profile.roles.filter((r) => r === role).length
    if (count('code') !== 1) {
      ctx.addIssue({ code: 'custom', path: ['roles'], message: 'Choose exactly one code column' })
    }
    for (const role of columnRoles) {
      if (role !== 'ignore' && role !== 'code' && count(role) > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['roles'],
          message: `Only one column can be ${columnRoleLabels[role]}`,
        })
      }
    }
    const rule = profile.qualification
    if (rule.mode === 'column' && count(rule.from) === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['qualification'],
        message: `Choose a ${columnRoleLabels[rule.from]} column to read qualification from`,
      })
    }
    if (Object.keys(rule.mode === 'column' ? rule.values : {}).length > 200) {
      ctx.addIssue({ code: 'custom', path: ['qualification'], message: 'Too many values' })
    }
  })

export type ColumnProfile = z.infer<typeof columnProfileSchema>
export type ColumnProfileInput = z.input<typeof columnProfileSchema>

/** A row after column mapping, before code normalization (review, step 6). */
export interface MappedRow {
  locator: string
  rawCode: string
  /** The state's own code-system text ("ICD-10"), if the file has that column. */
  codeSystemHint: string
  description: string
  category: string
  subcategory: string
  tier: string
  qualification: Qualification
  qualificationBasis: QualificationBasis
  /** The cell the qualification rule read (LA designation `0`), or '' for a fixed rule. */
  qualificationValue: string
  /** False when the source marks the row as not qualifying (GA "Yes/No" = No). */
  included: boolean
  /** The state's notes or rationale (GA). */
  notes: string
}

export interface MappingResult {
  rows: MappedRow[]
  /** Rows with every cell empty. */
  blankRows: number
  /** Locators of rows with content but no code. */
  noCodeRows: string[]
  /** Values in the qualification source column that the rule does not map. */
  unmappedQualificationValues: string[]
}

/** Values of an "Included" column that mean the row does not qualify. Blank means included. */
const NOT_INCLUDED = new Set(['no', 'n', 'false', '0', 'excluded'])

const cell = (row: RawRow, index: number) =>
  index < 0 ? '' : (row.cells[index] ?? '').trim().slice(0, MAX_CELL_LENGTH)

export function applyMapping(table: RawTable, profile: ColumnProfile): MappingResult {
  const at = (role: ColumnRole) => profile.roles.indexOf(role)
  const rule = profile.qualification
  const rows: MappedRow[] = []
  const noCodeRows: string[] = []
  const unmapped = new Set<string>()
  let blankRows = 0

  for (const row of table.rows) {
    if (row.cells.every((c) => c.trim() === '')) {
      blankRows++
      continue
    }
    const rawCode = cell(row, at('code'))
    if (rawCode === '') {
      noCodeRows.push(row.locator)
      continue
    }
    let qualification: Qualification
    let qualificationValue = ''
    if (rule.mode === 'fixed') {
      qualification = rule.value
    } else {
      const value = cell(row, at(rule.from))
      qualificationValue = value
      const mapped = rule.values[value]
      if (mapped === undefined) unmapped.add(value)
      qualification = mapped ?? 'unknown'
    }
    rows.push({
      locator: row.locator,
      rawCode,
      codeSystemHint: cell(row, at('codeSystem')),
      description: cell(row, at('description')),
      category: cell(row, at('category')) || profile.defaultCategory,
      subcategory: cell(row, at('subcategory')),
      tier: cell(row, at('tier')) || profile.defaultTier,
      qualification,
      qualificationBasis: rule.basis,
      qualificationValue,
      included: !NOT_INCLUDED.has(cell(row, at('included')).toLowerCase()),
      notes: cell(row, at('notes')),
    })
  }
  return {
    rows,
    blankRows,
    noCodeRows,
    unmappedQualificationValues: [...unmapped].sort(),
  }
}

const stateId = stateIdSchema

/** Body of `PUT /api/admin/column-profiles`. The server computes the header key. */
export const columnProfileSaveSchema = z
  .object({
    stateId,
    header: z.array(z.string().max(200)).min(1).max(MAX_COLUMNS),
    profile: columnProfileSchema,
  })
  .refine((body) => body.profile.roles.length === body.header.length, {
    message: 'One role per column',
    path: ['profile', 'roles'],
  })

export type ColumnProfileSave = z.infer<typeof columnProfileSaveSchema>

/** Query of `GET /api/admin/column-profiles`. */
export const columnProfileQuerySchema = z.object({
  stateId,
  headerKey: z
    .string()
    .min(1)
    .max(MAX_COLUMNS * 201),
})

/** `item` is null when nothing is saved for this layout yet. */
export const columnProfileResponseSchema = z.object({
  item: z
    .object({
      headerKey: z.string(),
      profile: columnProfileSchema,
      updatedBy: z.string(),
      updatedAt: z.string(),
    })
    .nullable(),
})
