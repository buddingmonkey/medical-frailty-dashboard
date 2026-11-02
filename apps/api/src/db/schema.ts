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
  federalCategories,
  mappingMethods,
  matchKinds,
  qualificationBases,
  qualifications,
  stateStatuses,
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
    /** URL slug, e.g. `louisiana`. Never changes once published (docs/seo.md). */
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
// Reference data and like codes

/** ICD-10-CM and HCPCS Level II only, from public-domain CMS files (roadmap M1 step 3). */
export const refCodes = sqliteTable(
  'ref_codes',
  {
    codeSystem: text('code_system', { enum: ['icd10cm', 'hcpcs'] }).notNull(),
    codeNorm: text('code_norm').notNull(),
    description: text('description').notNull(),
    parentNorm: text('parent_norm'),
    chapter: text('chapter'),
    validFrom: text('valid_from').notNull(),
    validTo: text('valid_to'),
  },
  (t) => [
    primaryKey({ columns: [t.codeSystem, t.codeNorm, t.validFrom] }),
    index('ref_codes_parent_idx').on(t.codeSystem, t.parentNorm),
    check('ref_codes_code_system_check', oneOf(t.codeSystem, ['icd10cm', 'hcpcs'])),
  ],
)

export const conditionGroups = sqliteTable('condition_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
})

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
