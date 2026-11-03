import { unifiedSaveResponseSchema } from '@mfcd/shared'
import { env } from 'cloudflare:workers'
import { expect } from 'vitest'

import { createDb } from '../db/client'
import { refCcsr, refCcsrCategories, refCodes, states } from '../db/schema'
import { send } from './draft-fixtures'
import { icd, publishVersion } from './public-fixtures'
import { resetDb } from './reset-db'

// The overview fixture (roadmap M5 step 4): four states, three published unified categories
// and a draft, small enough to check by hand. CCSR ids are made up (TST…), never AHRQ data.
// Used by the overview API tests and the server-rendered /compare page.

const db = createDb(env.DB)

async function createCategory(fields: {
  label: string
  ccsr: string[]
  federalCategory: string
  sortOrder: number
  status?: string
}) {
  const res = await send('POST', '/api/admin/unified', {
    definition: 'Test category.',
    includes: null,
    excludes: null,
    status: 'published',
    ...fields,
  })
  expect(res.status).toBe(201)
  return unifiedSaveResponseSchema.parse(await res.json()).id
}

async function approve(stateId: string, stateCategory: string, unifiedId: number) {
  const res = await send('PUT', `/api/admin/states/${stateId}/unified-mappings`, {
    stateCategory,
    stateSubcategory: '',
    approve: true,
    targets: [{ unifiedId, relation: 'exact', basis: 'state_text', confidence: 'high' }],
  })
  expect(res.status).toBe(200)
}

/**
 * Universe of "smi" (TST001–TST003): F200, F201, F209, F3110, F3120, F320 = 6 codes (F20 is a
 * header, F208 was deleted, F321 belongs to TST009 by the longest prefix). "kidney" (TST010):
 * N186. "equipment" has no CCSR group: union basis.
 *
 * GA (no mapping for Behavioral Health, so by CCSR, not reviewed): F20.0 exact, F31* prefix,
 * F32 exact header; equipment (approved): E0601, E0602.
 * MT (approved): ranges F20.0–F20.9 (same-length codes) and F31.*–F32.* (wildcards); E0601.
 * NE and LA have no list.
 */
export async function seedOverview(): Promise<{ smi: number; equipment: number; kidney: number }> {
  await resetDb(env.DB)
  await db.insert(states).values([
    { id: 'GA', slug: 'ga', name: 'Georgia', fips: '13' },
    { id: 'LA', slug: 'la', name: 'Louisiana', fips: '22', status: 'announced' },
    { id: 'MT', slug: 'mt', name: 'Montana', fips: '30' },
    { id: 'NE', slug: 'ne', name: 'Nebraska', fips: '31' },
  ])
  await db.insert(refCcsrCategories).values(
    ['TST001', 'TST002', 'TST003', 'TST009', 'TST010'].map((ccsrCategory) => ({
      ccsrCategory,
      description: `Test ${ccsrCategory}`,
      bodySystem: 'Test',
      release: 'ccsr-dx-test',
    })),
  )
  await db.insert(refCcsr).values(
    [
      ['F20', 'TST001'],
      ['F31', 'TST002'],
      ['F32', 'TST003'],
      ['F321', 'TST009'],
      ['N18', 'TST010'],
    ].map(([codeNorm = '', ccsrCategory = '']) => ({
      codeNorm,
      ccsrCategory,
      isDefault: 1,
      release: 'ccsr-dx-test',
    })),
  )
  const code = (codeNorm: string, billable = 1, validTo: string | null = null) => ({
    codeSystem: 'icd10cm' as const,
    codeNorm,
    description: `Code ${codeNorm}`,
    billable,
    validFrom: '2026-10-01',
    validTo,
  })
  await db
    .insert(refCodes)
    .values([
      code('F20', 0),
      code('F200'),
      code('F201'),
      code('F208', 1, '2026-09-30'),
      code('F209'),
      code('F31', 0),
      code('F3110'),
      code('F3120'),
      code('F32', 0),
      code('F320'),
      code('F321'),
      code('N186'),
    ])

  await publishVersion('GA', 'published', [
    icd('F200', 'Behavioral Health', { qualification: 'standalone' }),
    icd('F31', 'Behavioral Health', { matchKind: 'prefix', qualification: 'needs_support' }),
    icd('F32', 'Behavioral Health', { includesChildren: 0 }),
    {
      codeSystem: 'hcpcs',
      rawCode: 'E0601',
      codeNorm: 'E0601',
      stateCategory: 'DME',
      qualification: 'standalone',
    },
    { codeSystem: 'hcpcs', rawCode: 'E0602', codeNorm: 'E0602', stateCategory: 'DME' },
  ])
  await publishVersion('MT', 'published', [
    icd('F200', 'SMI', {
      matchKind: 'range',
      rangeEndNorm: 'F209',
      includesChildren: 0,
      qualification: 'standalone',
    }),
    icd('F31', 'SMI', {
      matchKind: 'range',
      rangeEndNorm: 'F32',
      includesChildren: 1,
      qualification: 'standalone',
    }),
    {
      codeSystem: 'hcpcs',
      rawCode: 'E0601',
      codeNorm: 'E0601',
      stateCategory: 'DME',
      qualification: 'standalone',
    },
  ])
  // A draft is never public, nor are draft categories.
  await publishVersion('NE', 'draft', [icd('F200', 'SMI')])

  const smi = await createCategory({
    label: 'Serious mental illness',
    ccsr: ['TST001', 'TST002', 'TST003'],
    federalCategory: 'disabling_mental_disorder',
    sortOrder: 1,
  })
  const kidney = await createCategory({
    label: 'Kidney failure',
    ccsr: ['TST010'],
    federalCategory: 'serious_complex_medical',
    sortOrder: 1,
  })
  const equipment = await createCategory({
    label: 'Equipment',
    ccsr: [],
    federalCategory: 'physical_idd_adl',
    sortOrder: 2,
  })
  await createCategory({
    label: 'Draft psychoses',
    ccsr: ['TST001'],
    federalCategory: 'disabling_mental_disorder',
    sortOrder: 0,
    status: 'draft',
  })
  await approve('GA', 'DME', equipment)
  await approve('MT', 'SMI', smi)
  await approve('MT', 'DME', equipment)
  return { smi, equipment, kidney }
}
