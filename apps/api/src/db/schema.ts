// Drizzle schema for D1 (docs/data-model.md, "Tables"). After changing it, run
// `pnpm db:generate` and review the new SQL in ../../migrations. The FTS5 table and its triggers
// live in a hand-written migration (migrations/0001_entries_fts.sql), because drizzle-kit cannot
// generate virtual tables.
//
// Conventions: dates are ISO-8601 text (`YYYY-MM-DD` for calendar dates, UTC timestamps with
// milliseconds otherwise). Enum columns get a CHECK built from the lists in @mfcd/shared.
// `state_subcategory` is '' rather than NULL so unique keys work (SQLite treats NULLs as distinct).
import {
  codeSystems,
  conditionGroupStatuses,
  federalCategories,
  mappingBases,
  mappingConfidences,
  mappingMethods,
  mappingRelations,
  matchKinds,
  placementBases,
  qualificationBases,
  qualifications,
  stateStatuses,
  unifiedMappingStatuses,
  unifiedStatuses,
  versionStatuses,
  watchKinds,
  watchStatuses,
} from '@mfcd/shared'
import { sql, type SQL } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
  type SQLiteColumn,
} from 'drizzle-orm/sqlite-core'

/** `col IN ('a', 'b')` for a CHECK constraint. Values are our own constants, quoted anyway. */
function oneOf(column: SQLiteColumn, values: readonly string[]): SQL {
  const list = values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', ')
  return sql`${column} IN (${sql.raw(list)})`
}

/** 0 or 1 (or NULL when the column is nullable). */
function isBoolean(column: SQLiteColumn): SQL {
  return sql`${column} IN (0, 1)`
}

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
const timestamp = (name: string) => text(name).notNull().default(now)

// ---------------------------------------------------------------------------------------------
// States and their source documents

export const states = sqliteTable(
  'states',
  {
    /** Two-letter postal code, uppercase. */
    id: text('id').primaryKey(),
    /** URL slug: the lowercase postal code (`/states/ga`; user, 2026-11-01). Never changes. */
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    fips: text('fips').notNull(),
    status: text('status', { enum: stateStatuses }).notNull().default('none'),
    /** The only version public queries read. NULL until the first publish. */
    publishedVersionId: integer('published_version_id').references(
      (): AnySQLiteColumn => datasetVersions.id,
    ),
    notesMd: text('notes_md'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    check('states_id_check', sql`length(${t.id}) = 2 AND ${t.id} = upper(${t.id})`),
    check('states_slug_check', sql`${t.slug} = lower(${t.id})`),
    check('states_status_check', oneOf(t.status, stateStatuses)),
  ],
)

export const sourceDocuments = sqliteTable(
  'source_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stateId: text('state_id')
      .notNull()
      .references(() => states.id),
    title: text('title').notNull(),
    /** NULL when the public URL is unknown (e.g. the LA code list PDF). */
    url: text('url'),
    /** The date the state put on or published the document (`YYYY-MM-DD`). */
    publisherDate: text('publisher_date'),
    retrievedAt: timestamp('retrieved_at'),
    fileType: text('file_type').notNull(),
    sha256: text('sha256').notNull(),
    r2Key: text('r2_key').notNull().unique(),
    byteSize: integer('byte_size').notNull(),
    uploadedBy: text('uploaded_by').notNull(),
  },
  (t) => [uniqueIndex('source_documents_state_sha256_idx').on(t.stateId, t.sha256)],
)

/**
 * What each column of a state's file means (docs/ingestion.md, step 4), saved per header
 * layout so the next file with the same headers maps itself. `profile_json` is a
 * `columnProfileSchema` value from packages/shared.
 */
export const columnProfiles = sqliteTable(
  'column_profiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stateId: text('state_id')
      .notNull()
      .references(() => states.id),
    headerKey: text('header_key').notNull(),
    profileJson: text('profile_json').notNull(),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [uniqueIndex('column_profiles_state_header_idx').on(t.stateId, t.headerKey)],
)

// ---------------------------------------------------------------------------------------------
// Versions and entries

export const datasetVersions = sqliteTable(
  'dataset_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stateId: text('state_id')
      .notNull()
      .references(() => states.id),
    versionNo: integer('version_no').notNull(),
    status: text('status', { enum: versionStatuses }).notNull().default('draft'),
    label: text('label'),
    effectiveDate: text('effective_date'),
    /** When the state published this list (`YYYY-MM-DD`). Shown on the page and in JSON-LD. */
    statePublishedDate: text('state_published_date'),
    /**
     * Our last-updated time for the public page: set on publish, and moved when an admin
     * changes a category mapping. Feeds `dateModified` and the sitemap's `lastmod`.
     */
    contentUpdatedAt: text('content_updated_at'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at'),
    /**
     * Last activity on a draft: a source added, rows sent, checks run, discarded. NULL on rows
     * older than migration 0015 that it could not backfill; read `coalesce(updated_at,
     * created_at)`. Draft cleanup (src/maintenance) expires drafts idle for 30 days.
     */
    updatedAt: text('updated_at'),
    publishedBy: text('published_by'),
    publishedAt: text('published_at'),
    checkReportJson: text('check_report_json'),
    rowCount: integer('row_count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('dataset_versions_state_no_idx').on(t.stateId, t.versionNo),
    // At most one published version per state; publish supersedes the old one first.
    uniqueIndex('dataset_versions_one_published_idx')
      .on(t.stateId)
      .where(sql`${t.status} = 'published'`),
    check('dataset_versions_status_check', oneOf(t.status, versionStatuses)),
  ],
)

export const versionSources = sqliteTable(
  'version_sources',
  {
    versionId: integer('version_id')
      .notNull()
      .references(() => datasetVersions.id, { onDelete: 'cascade' }),
    sourceDocumentId: integer('source_document_id')
      .notNull()
      .references(() => sourceDocuments.id),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.sourceDocumentId] })],
)

/**
 * One table or sheet of a source, as sent to a draft (NE's PDF has two tables; an Excel file
 * one per sheet). Re-sending a part replaces only its entries. The counts let the checks see
 * an upload that stopped half way.
 */
export const draftParts = sqliteTable(
  'draft_parts',
  {
    versionId: integer('version_id')
      .notNull()
      .references(() => datasetVersions.id, { onDelete: 'cascade' }),
    sourceDocumentId: integer('source_document_id')
      .notNull()
      .references(() => sourceDocuments.id),
    /** Table or sheet name from the parser ("Pages 2–294", "Sheet1"). */
    part: text('part').notNull(),
    /** Entries the browser said it would send. */
    expectedEntries: integer('expected_entries').notNull(),
    /** Rows that could not be read and were not dropped in review. */
    invalidRowCount: integer('invalid_row_count').notNull(),
    /** States the file names (title, headers), as a JSON array of 2-letter codes. */
    namedStateIdsJson: text('named_state_ids_json').notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.sourceDocumentId, t.part] })],
)

export const entries = sqliteTable(
  'entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    versionId: integer('version_id')
      .notNull()
      .references(() => datasetVersions.id, { onDelete: 'cascade' }),
    codeSystem: text('code_system', { enum: codeSystems }).notNull(),
    rawCode: text('raw_code').notNull(),
    codeNorm: text('code_norm').notNull(),
    matchKind: text('match_kind', { enum: matchKinds }).notNull().default('exact'),
    rangeEndNorm: text('range_end_norm'),
    /** 1: covers child codes; 0: this code only; NULL: unclear, admin decides. */
    includesChildren: integer('includes_children'),
    descriptionPublished: text('description_published'),
    stateCategory: text('state_category').notNull(),
    stateSubcategory: text('state_subcategory').notNull().default(''),
    tier: text('tier'),
    attributesJson: text('attributes_json'),
    qualification: text('qualification', { enum: qualifications }).notNull().default('unknown'),
    qualificationBasis: text('qualification_basis', { enum: qualificationBases })
      .notNull()
      .default('published'),
    sourceDocumentId: integer('source_document_id')
      .notNull()
      .references(() => sourceDocuments.id),
    /** Page, sheet or row in the source document. */
    sourceLocator: text('source_locator'),
    /** The table or sheet of the source the entry came from (`draft_parts.part`). */
    sourcePart: text('source_part').notNull().default(''),
  },
  (t) => [
    index('entries_version_code_idx').on(t.versionId, t.codeNorm),
    index('entries_code_idx').on(t.codeNorm),
    index('entries_version_category_idx').on(t.versionId, t.stateCategory, t.stateSubcategory),
    check('entries_code_system_check', oneOf(t.codeSystem, codeSystems)),
    check('entries_match_kind_check', oneOf(t.matchKind, matchKinds)),
    check(
      'entries_range_end_check',
      sql`(${t.matchKind} = 'range') = (${t.rangeEndNorm} IS NOT NULL)`,
    ),
    check('entries_includes_children_check', isBoolean(t.includesChildren)),
    check('entries_qualification_check', oneOf(t.qualification, qualifications)),
    check('entries_qualification_basis_check', oneOf(t.qualificationBasis, qualificationBases)),
  ],
)

/** Belongs to the state, not the version, so a re-upload keeps the admin's mapping. */
export const categoryMappings = sqliteTable(
  'category_mappings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stateId: text('state_id')
      .notNull()
      .references(() => states.id),
    stateCategory: text('state_category').notNull(),
    stateSubcategory: text('state_subcategory').notNull().default(''),
    federalCategory: text('federal_category', { enum: federalCategories }).notNull(),
    method: text('method', { enum: mappingMethods }).notNull(),
    /** 0–1 for auto mappings; NULL for manual ones. */
    confidence: real('confidence'),
    mappedBy: text('mapped_by'),
    mappedAt: timestamp('mapped_at'),
  },
  (t) => [
    uniqueIndex('category_mappings_state_category_idx').on(
      t.stateId,
      t.stateCategory,
      t.stateSubcategory,
    ),
    check('category_mappings_federal_check', oneOf(t.federalCategory, federalCategories)),
    check('category_mappings_method_check', oneOf(t.method, mappingMethods)),
    check('category_mappings_confidence_check', sql`${t.confidence} BETWEEN 0 AND 1`),
  ],
)

// ---------------------------------------------------------------------------------------------
// Unified categories (docs/data-model.md, "Unified categories (M5)")

/** A unified category's federal parent: any federal category but "unmapped". */
const parentCategories = federalCategories.filter((c) => c !== 'unmapped')

/** Admin-curated categories the many-state views compare (`/compare/<slug>`). */
export const unifiedCategories = sqliteTable(
  'unified_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    definition: text('definition').notNull(),
    includes: text('includes'),
    excludes: text('excludes'),
    /** The parent shown in the overview. */
    federalCategory: text('federal_category', { enum: federalCategories }).notNull(),
    status: text('status', { enum: unifiedStatuses }).notNull().default('draft'),
    /** +1 on each edit of label, definition, includes or excludes. */
    version: integer('version').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [
    uniqueIndex('unified_categories_slug_idx').on(t.slug),
    check(
      'unified_categories_slug_check',
      sql`${t.slug} <> '' AND ${t.slug} NOT GLOB '*[^a-z0-9-]*'`,
    ),
    check('unified_categories_federal_check', oneOf(t.federalCategory, parentCategories)),
    check('unified_categories_status_check', oneOf(t.status, unifiedStatuses)),
    check('unified_categories_version_check', sql`${t.version} >= 1`),
  ],
)

/** The CCSR groups whose ICD-10-CM codes belong to a unified category (codes: `ref_ccsr`). */
export const unifiedCcsr = sqliteTable(
  'unified_ccsr',
  {
    unifiedId: integer('unified_id')
      .notNull()
      .references(() => unifiedCategories.id, { onDelete: 'cascade' }),
    /** AHRQ CCSR category, e.g. `MBD001`. */
    ccsrCategory: text('ccsr_category').notNull(),
  },
  (t) => [primaryKey({ columns: [t.unifiedId, t.ccsrCategory] })],
)

/**
 * A state category → one unified category (one row per target). Belongs to the state, like
 * category_mappings. Never deleted: a change marks the old row `superseded` and points
 * `superseded_by` at the new one. `by_code` rows have no target: each code goes by its CCSR.
 */
export const unifiedMappings = sqliteTable(
  'unified_mappings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stateId: text('state_id')
      .notNull()
      .references(() => states.id),
    stateCategory: text('state_category').notNull(),
    stateSubcategory: text('state_subcategory').notNull().default(''),
    unifiedId: integer('unified_id').references(() => unifiedCategories.id),
    relation: text('relation', { enum: mappingRelations }).notNull(),
    basis: text('basis', { enum: mappingBases }).notNull(),
    confidence: text('confidence', { enum: mappingConfidences }).notNull(),
    rationale: text('rationale'),
    citation: text('citation'),
    mappedBy: text('mapped_by').notNull(),
    mappedAt: timestamp('mapped_at'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    status: text('status', { enum: unifiedMappingStatuses }).notNull().default('proposed'),
    supersededBy: integer('superseded_by').references((): AnySQLiteColumn => unifiedMappings.id),
  },
  (t) => [
    index('unified_mappings_state_category_idx').on(
      t.stateId,
      t.stateCategory,
      t.stateSubcategory,
      t.status,
    ),
    check('unified_mappings_relation_check', oneOf(t.relation, mappingRelations)),
    check('unified_mappings_basis_check', oneOf(t.basis, mappingBases)),
    check('unified_mappings_confidence_check', oneOf(t.confidence, mappingConfidences)),
    check('unified_mappings_status_check', oneOf(t.status, unifiedMappingStatuses)),
    check(
      'unified_mappings_by_code_check',
      sql`(${t.relation} = 'by_code') = (${t.unifiedId} IS NULL)`,
    ),
    check(
      'unified_mappings_reviewed_check',
      sql`${t.status} <> 'approved' OR (${t.reviewedBy} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL)`,
    ),
  ],
)

/**
 * Where each entry of a **published** version counts among the **published** unified categories
 * (`unifiedOf`, recomputed by src/db/placement.ts after publish, rollback, mapping approval and
 * category changes). Public pages read it instead of placing entries per request. `WITHOUT
 * ROWID` with no other index (one D1 write per row; reads go by entry): added by hand in
 * migrations/0009_entry_unified.sql and guarded by src/db/schema.test.ts.
 */
export const entryUnified = sqliteTable(
  'entry_unified',
  {
    entryId: integer('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    unifiedId: integer('unified_id')
      .notNull()
      .references(() => unifiedCategories.id),
    /** `mapping`: an approved mapping names the category. `by_code`: placed by CCSR group. */
    basis: text('basis', { enum: placementBases }).notNull(),
    /** 1: an admin approved the placement (an approved mapping or an approved by_code row). */
    reviewed: integer('reviewed').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entryId, t.unifiedId] }),
    check('entry_unified_basis_check', oneOf(t.basis, placementBases)),
    check('entry_unified_reviewed_check', isBoolean(t.reviewed)),
  ],
)

/**
 * A unified category's universe: every billable ICD-10-CM code of the current release
 * (`ref_codes`) whose CCSR groups (longest-prefix rule) meet the category's. Rewritten when the
 * category's CCSR set changes. `WITHOUT ROWID`, no other index, like entry_unified.
 */
export const unifiedUniverse = sqliteTable(
  'unified_universe',
  {
    unifiedId: integer('unified_id')
      .notNull()
      .references(() => unifiedCategories.id, { onDelete: 'cascade' }),
    codeNorm: text('code_norm').notNull(),
  },
  (t) => [primaryKey({ columns: [t.unifiedId, t.codeNorm] })],
)

/**
 * How alike two states' published lists are (roadmap M5 step 7; docs/data-model.md, "Pair
 * similarity"): over each state's set of codes (every billable current ICD-10-CM code it lists
 * or covers, plus its other entries by `comparePatternKey`). One row per pair of states with a
 * list, `state_a < state_b`. Recomputed by src/db/similarity.ts after publish and rollback (that
 * state's pairs); `computed_at` is when the row's numbers last changed. `WITHOUT ROWID` with no
 * other index (one D1 write per row; at most 1,275 rows), added by hand in
 * migrations/0010_state_similarity.sql and guarded by src/db/schema.test.ts.
 */
export const stateSimilarity = sqliteTable(
  'state_similarity',
  {
    stateA: text('state_a')
      .notNull()
      .references(() => states.id),
    stateB: text('state_b')
      .notNull()
      .references(() => states.id),
    shared: integer('shared').notNull(),
    onlyA: integer('only_a').notNull(),
    onlyB: integer('only_b').notNull(),
    /** shared / (shared + only_a + only_b); 0 when both sets are empty. */
    jaccard: real('jaccard').notNull(),
    computedAt: timestamp('computed_at'),
  },
  (t) => [
    primaryKey({ columns: [t.stateA, t.stateB] }),
    check('state_similarity_order_check', sql`${t.stateA} < ${t.stateB}`),
    check(
      'state_similarity_counts_check',
      sql`${t.shared} >= 0 AND ${t.onlyA} >= 0 AND ${t.onlyB} >= 0 AND ${t.jaccard} >= 0 AND ${t.jaccard} <= 1`,
    ),
  ],
)

// ---------------------------------------------------------------------------------------------
// Reference data and like codes

/**
 * ICD-10-CM and HCPCS Level II only, from public-domain CMS files (packages/reference-data).
 * About 107k rows against D1's free tier of 100k rows written per day, so each row must cost
 * exactly one write: the table is `WITHOUT ROWID` (the primary key is the table) and has no
 * other index. Children of a code are a primary-key range scan (`code_norm >= 'F20' AND
 * code_norm < 'F21'`). drizzle-kit cannot express `WITHOUT ROWID`: it is added by hand in
 * migrations/0000_init.sql, and src/db/schema.test.ts fails if a migration loses it.
 */
export const refCodes = sqliteTable(
  'ref_codes',
  {
    codeSystem: text('code_system', { enum: ['icd10cm', 'hcpcs'] }).notNull(),
    codeNorm: text('code_norm').notNull(),
    description: text('description').notNull(),
    /** The nearest shorter code that exists (`T8450XA` → `T8450`). */
    parentNorm: text('parent_norm'),
    /** ICD-10-CM chapter number as text (`'5'`); NULL for HCPCS. */
    chapter: text('chapter'),
    /** ICD-10-CM: 1 = valid for billing, 0 = header. HCPCS: NULL. */
    billable: integer('billable'),
    /** First release we loaded the code from. */
    validFrom: text('valid_from').notNull(),
    /** HCPCS termination date, or the day a yearly update deleted the code. */
    validTo: text('valid_to'),
  },
  (t) => [
    primaryKey({ columns: [t.codeSystem, t.codeNorm, t.validFrom] }),
    check('ref_codes_code_system_check', oneOf(t.codeSystem, ['icd10cm', 'hcpcs'])),
    check('ref_codes_billable_check', isBoolean(t.billable)),
  ],
)

/**
 * AHRQ CCSR body-system categories (`MBD001`), from packages/reference-data. Source: Clinical
 * Classifications Software Refined (CCSR) for ICD-10-CM Diagnoses, v2026.1. Healthcare Cost and
 * Utilization Project (HCUP). Agency for Healthcare Research and Quality, Rockville, MD.
 */
export const refCcsrCategories = sqliteTable('ref_ccsr_categories', {
  ccsrCategory: text('ccsr_category').primaryKey(),
  description: text('description').notNull(),
  /** The body system's name (`MBD` → "Mental, behavioral, and neurodevelopmental disorders"). */
  bodySystem: text('body_system').notNull(),
  /** e.g. `ccsr-dx-2026.1`. */
  release: text('release').notNull(),
})

/**
 * ICD-10-CM → CCSR categories, one-to-many, stored by prefix: when every code under a prefix
 * (3+ characters) has the same categories and default, the prefix has the rows instead of each
 * code. Read with `ccsrLookupPrefixes` / `ccsrGroupsOf` (packages/shared/src/ccsr.ts):
 * longest prefix with rows wins. `WITHOUT ROWID` with no other index, like ref_codes (one D1
 * write per row); added by hand in migrations/0008_ref_ccsr.sql and guarded by
 * src/db/schema.test.ts.
 */
export const refCcsr = sqliteTable(
  'ref_ccsr',
  {
    /** ICD-10-CM code or prefix, no dot. */
    codeNorm: text('code_norm').notNull(),
    ccsrCategory: text('ccsr_category').notNull(),
    /** 1 = CCSR's inpatient default category for these codes (none when it is XXX000). */
    isDefault: integer('is_default').notNull().default(0),
    release: text('release').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.codeNorm, t.ccsrCategory] }),
    check('ref_ccsr_is_default_check', isBoolean(t.isDefault)),
  ],
)

export const conditionGroups = sqliteTable(
  'condition_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    /** What the group means, in a sentence or two. */
    definition: text('definition').notNull().default(''),
    /** Where its members come from: code set headings, ICD-10-CM blocks, a state's category. */
    sources: text('sources').notNull().default(''),
    /** Only published groups give like codes on public pages. */
    status: text('status', { enum: conditionGroupStatuses }).notNull().default('draft'),
    updatedBy: text('updated_by').notNull().default(''),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [check('condition_groups_status_check', oneOf(t.status, conditionGroupStatuses))],
)

/** A code, prefix or range in one code system that belongs to a condition group. */
export const conditionMembers = sqliteTable(
  'condition_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    groupId: integer('group_id')
      .notNull()
      .references(() => conditionGroups.id, { onDelete: 'cascade' }),
    codeSystem: text('code_system', { enum: codeSystems }).notNull(),
    matchKind: text('match_kind', { enum: matchKinds }).notNull(),
    codeNorm: text('code_norm').notNull(),
    rangeEndNorm: text('range_end_norm'),
  },
  (t) => [
    index('condition_members_group_idx').on(t.groupId),
    index('condition_members_code_idx').on(t.codeSystem, t.codeNorm),
    check('condition_members_code_system_check', oneOf(t.codeSystem, codeSystems)),
    check('condition_members_match_kind_check', oneOf(t.matchKind, matchKinds)),
    check(
      'condition_members_range_end_check',
      sql`(${t.matchKind} = 'range') = (${t.rangeEndNorm} IS NOT NULL)`,
    ),
  ],
)

/**
 * Per-state override by ICD-10-CM chapter, for states that group codes only by chapter (NE,
 * GA): an override wins over the category mapping for ICD-10-CM entries in that chapter
 * (`federalCategoryOf` in packages/shared). Belongs to the state, like category_mappings.
 */
export const chapterMappings = sqliteTable(
  'chapter_mappings',
  {
    stateId: text('state_id')
      .notNull()
      .references(() => states.id),
    /** ICD-10-CM chapter number (1–22). */
    chapter: integer('chapter').notNull(),
    federalCategory: text('federal_category', { enum: federalCategories }).notNull(),
    mappedBy: text('mapped_by').notNull(),
    mappedAt: timestamp('mapped_at'),
  },
  (t) => [
    primaryKey({ columns: [t.stateId, t.chapter] }),
    check('chapter_mappings_chapter_check', sql`${t.chapter} BETWEEN 1 AND 22`),
    check('chapter_mappings_federal_check', oneOf(t.federalCategory, federalCategories)),
  ],
)

// ---------------------------------------------------------------------------------------------
// Site settings, audit and watch dates

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

/** Admin actions. `actor_email` is an admin's Access identity, never a member's. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: timestamp('at'),
    actorEmail: text('actor_email').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    detailsJson: text('details_json'),
  },
  (t) => [index('audit_log_at_idx').on(t.at)],
)

export const watchItems = sqliteTable(
  'watch_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    kind: text('kind', { enum: watchKinds }).notNull(),
    stateId: text('state_id').references(() => states.id),
    dueDate: text('due_date'),
    dateIsApproximate: integer('date_is_approximate').notNull().default(0),
    whyMd: text('why_md').notNull(),
    linksJson: text('links_json'),
    status: text('status', { enum: watchStatuses }).notNull().default('open'),
    resolutionMd: text('resolution_md'),
    resolvedBy: text('resolved_by'),
    resolvedAt: text('resolved_at'),
    repeatDays: integer('repeat_days'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at'),
  },
  (t) => [
    index('watch_items_status_due_idx').on(t.status, t.dueDate),
    check('watch_items_kind_check', oneOf(t.kind, watchKinds)),
    check('watch_items_status_check', oneOf(t.status, watchStatuses)),
    check('watch_items_approximate_check', isBoolean(t.dateIsApproximate)),
    check('watch_items_repeat_check', sql`${t.repeatDays} > 0`),
  ],
)
