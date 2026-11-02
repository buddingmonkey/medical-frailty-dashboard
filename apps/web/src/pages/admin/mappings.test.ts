import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// CCSR ids are made up (TST…), as in the shared tests.
const unifiedItem = (id: number, label: string, status: string) => ({
  id,
  slug: label.toLowerCase().replace(/ /g, '-'),
  label,
  definition: 'Test.',
  includes: null,
  excludes: null,
  federalCategory: 'disabling_mental_disorder',
  sortOrder: 0,
  ccsr: [],
  status,
  version: 1,
  createdBy: 'admin@example.org',
  createdAt: '2026-11-02T15:00:00.000Z',
  updatedBy: 'admin@example.org',
  updatedAt: '2026-11-02T15:00:00.000Z',
  ccsrGroups: [],
  approvedMappings: 0,
})

const mapping = (fields: Record<string, unknown>) => ({
  id: 1,
  stateId: 'LA',
  stateCategory: 'Behavioral Health',
  stateSubcategory: '',
  unifiedId: 1,
  relation: 'exact',
  basis: 'state_text',
  confidence: 'high',
  rationale: null,
  citation: null,
  mappedBy: 'admin@example.org',
  mappedAt: '2026-11-02T15:00:00.000Z',
  reviewedBy: 'admin@example.org',
  reviewedAt: '2026-11-02T15:00:00.000Z',
  status: 'approved',
  supersededBy: null,
  ...fields,
})

const data = {
  categories: [
    {
      stateCategory: '',
      stateSubcategory: '',
      entries: 10,
      icdEntries: 10,
      mappings: [
        mapping({
          id: 2,
          stateCategory: '',
          unifiedId: null,
          relation: 'by_code',
          basis: 'admin_judgement',
          reviewedBy: null,
          reviewedAt: null,
          status: 'proposed',
        }),
      ],
      suggestion: { ccsr: [], unified: [], withoutCcsr: 10 },
    },
    {
      stateCategory: 'Behavioral Health',
      stateSubcategory: '',
      entries: 4,
      icdEntries: 3,
      mappings: [mapping({})],
      suggestion: {
        ccsr: [
          { ccsrCategory: 'TST001', count: 2, description: 'Schizophrenia spectrum' },
          { ccsrCategory: 'TST002', count: 1, description: null },
        ],
        unified: [
          {
            unifiedId: 1,
            label: 'Serious mental illness',
            status: 'published',
            covered: 2,
            share: 2 / 3,
          },
          { unifiedId: 2, label: 'Mood disorders', status: 'draft', covered: 1, share: 1 / 3 },
        ],
        withoutCcsr: 1,
      },
    },
    {
      stateCategory: 'Pharmacy',
      stateSubcategory: '',
      entries: 1,
      icdEntries: 0,
      mappings: [],
      suggestion: { ccsr: [], unified: [], withoutCcsr: 0 },
    },
  ],
}

function fakeApi() {
  const puts: unknown[] = []
  const approvals: unknown[] = []
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/states', () =>
      HttpResponse.json({
        items: [
          { id: 'LA', name: 'Louisiana', status: 'published' },
          { id: 'MT', name: 'Montana', status: 'none' },
        ],
      }),
    ),
    http.get('/api/admin/unified', () =>
      HttpResponse.json({
        items: [
          unifiedItem(1, 'Serious mental illness', 'published'),
          unifiedItem(2, 'Mood disorders', 'draft'),
        ],
      }),
    ),
    http.get('/api/admin/states/LA/unified-mappings', () => HttpResponse.json(data)),
    http.put('/api/admin/states/LA/unified-mappings', async ({ request }) => {
      const body = (await request.json()) as { approve: boolean }
      puts.push(body)
      return HttpResponse.json({
        ok: true,
        status: body.approve ? 'approved' : 'proposed',
        review: body.approve ? 'Reviewed by one admin' : 'Proposed',
      })
    }),
    http.post('/api/admin/states/LA/unified-mappings/approve', async ({ request }) => {
      approvals.push(await request.json())
      return HttpResponse.json({ ok: true, status: 'approved', review: 'Reviewed by one admin' })
    }),
  )
  return { puts, approvals }
}

let user: ReturnType<typeof userEvent.setup>

async function open() {
  user = userEvent.setup()
  await renderRoute('/admin/mappings')
  await screen.findByRole('option', { name: 'Louisiana' })
  await user.selectOptions(screen.getByLabelText('State'), 'LA')
  return screen.findByRole('table', { name: 'Categories of Louisiana' })
}

const rowOf = (table: HTMLElement, name: string) => {
  const row = within(table).getByRole('rowheader', { name }).closest('tr')
  if (!row) throw new Error(`no row ${name}`)
  return row
}

describe('/admin/mappings', () => {
  it('offers only states with a published list', async () => {
    fakeApi()
    await open()
    expect(screen.queryByRole('option', { name: 'Montana' })).toBeNull()
  })

  it('lists each state category with its entries, current mapping and suggestion', async () => {
    fakeApi()
    const table = await open()
    const bh = rowOf(table, 'Behavioral Health')
    expect(within(bh).getByText('Exact: Serious mental illness')).toBeTruthy()
    expect(within(bh).getByText(/Reviewed by one admin/)).toBeTruthy()
    expect(within(bh).getByText(/Serious mental illness 67%/)).toBeTruthy()
    const none = rowOf(table, '(no category)')
    expect(within(none).getByText(/Proposed/)).toBeTruthy()
    expect(within(none).getByText(/Place each code by its CCSR group/)).toBeTruthy()
    expect(within(rowOf(table, 'Pharmacy')).getByText('Not mapped')).toBeTruthy()
  })

  it('adds a suggested target and saves the mapping as approved', async () => {
    const { puts } = fakeApi()
    const table = await open()
    await user.click(
      within(rowOf(table, 'Behavioral Health')).getByRole('button', {
        name: 'Edit Behavioral Health',
      }),
    )
    const form = screen.getByRole('form', { name: 'Map Behavioral Health' })
    const suggestion = within(form).getByRole('region', { name: 'Suggestion' })
    expect(within(suggestion).getByText('TST001').closest('li')?.textContent).toMatch(
      /TST001\s+Schizophrenia spectrum: 2\s+entries/,
    )
    await user.click(
      within(suggestion).getByRole('button', { name: 'Add Mood disorders as a target' }),
    )
    await user.selectOptions(within(form).getByLabelText('Relation for target 2'), 'narrow')
    expect(within(form).getByText(/the unified category is narrower than the state’s/)).toBeTruthy()
    await user.click(within(form).getByRole('button', { name: 'Save and approve' }))
    expect(puts).toEqual([
      {
        stateCategory: 'Behavioral Health',
        stateSubcategory: '',
        approve: true,
        targets: [
          {
            unifiedId: 1,
            relation: 'exact',
            basis: 'state_text',
            confidence: 'high',
            rationale: null,
            citation: null,
          },
          {
            unifiedId: 2,
            relation: 'narrow',
            basis: 'ccsr_agreement',
            confidence: 'medium',
            rationale: null,
            citation: null,
          },
        ],
      },
    ])
    expect((await screen.findByRole('status')).textContent).toContain(
      'Behavioral Health: Reviewed by one admin',
    )
  })

  it('saves "place each code by its CCSR group" as a proposal', async () => {
    const { puts } = fakeApi()
    const table = await open()
    await user.click(
      within(rowOf(table, 'Pharmacy')).getByRole('button', { name: 'Edit Pharmacy' }),
    )
    const form = screen.getByRole('form', { name: 'Map Pharmacy' })
    await user.click(within(form).getByRole('button', { name: 'Save as proposed' }))
    expect(within(form).getByRole('alert').textContent).toContain('Choose a unified category')
    await user.click(within(form).getByRole('radio', { name: 'Place each code by its CCSR group' }))
    await user.type(within(form).getByLabelText('Rationale'), 'Drug classes only.')
    await user.click(within(form).getByRole('button', { name: 'Save as proposed' }))
    expect(puts).toEqual([
      {
        stateCategory: 'Pharmacy',
        stateSubcategory: '',
        approve: false,
        byCode: true,
        basis: 'admin_judgement',
        confidence: 'high',
        rationale: 'Drug classes only.',
        citation: null,
      },
    ])
  })

  it('approves an existing proposal as is', async () => {
    const { approvals } = fakeApi()
    const table = await open()
    await user.click(
      within(rowOf(table, '(no category)')).getByRole('button', {
        name: 'Approve the proposal for (no category)',
      }),
    )
    expect(approvals).toEqual([{ stateCategory: '', stateSubcategory: '' }])
    expect((await screen.findByRole('status')).textContent).toContain(
      '(no category): Reviewed by one admin',
    )
  })
})
