import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// CCSR ids and names are made up (TST…), as in the shared tests.
const ccsr = [
  { ccsrCategory: 'TST001', description: 'Schizophrenia spectrum', bodySystem: 'Mental' },
  { ccsrCategory: 'TST002', description: 'Bipolar disorders', bodySystem: 'Mental' },
  { ccsrCategory: 'TST101', description: 'Chronic kidney disease', bodySystem: 'Genitourinary' },
]

const smi = {
  id: 1,
  slug: 'serious-mental-illness',
  label: 'Serious mental illness',
  definition: 'Psychotic and major mood disorders.',
  includes: null,
  excludes: null,
  federalCategory: 'disabling_mental_disorder',
  sortOrder: 0,
  ccsr: ['TST001'],
  status: 'published',
  version: 2,
  createdBy: 'admin@example.org',
  createdAt: '2026-11-02T15:00:00.000Z',
  updatedBy: 'admin@example.org',
  updatedAt: '2026-11-02T15:00:00.000Z',
  ccsrGroups: [{ ccsrCategory: 'TST001', description: 'Schizophrenia spectrum' }],
  approvedMappings: 3,
}

function fakeApi(items: unknown[] = [smi]) {
  const creates: unknown[] = []
  const updates: { path: string; body: unknown }[] = []
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/unified', () => HttpResponse.json({ items })),
    http.get('/api/admin/ccsr-categories', () => HttpResponse.json({ items: ccsr })),
    http.post('/api/admin/unified', async ({ request }) => {
      const body = (await request.json()) as { slug?: string }
      creates.push(body)
      if (body.slug === 'serious-mental-illness') {
        return HttpResponse.json(
          {
            error: 'The slug "serious-mental-illness" is already used by another unified category',
          },
          { status: 409 },
        )
      }
      return HttpResponse.json({ id: 2, slug: body.slug ?? 'x', version: 1 }, { status: 201 })
    }),
    http.put('/api/admin/unified/:id', async ({ request }) => {
      updates.push({ path: new URL(request.url).pathname, body: await request.json() })
      return HttpResponse.json({ id: 1, slug: 'serious-mental-illness', version: 2 })
    }),
  )
  return { creates, updates }
}

let user: ReturnType<typeof userEvent.setup>

async function open() {
  user = userEvent.setup()
  await renderRoute('/admin/unified')
  return screen.findByRole('table', { name: /Disabling mental disorder/ })
}

describe('/admin/unified', () => {
  it('lists unified categories under their federal parent', async () => {
    fakeApi()
    const table = await open()
    const row = within(table)
      .getByRole('rowheader', { name: /Serious mental illness/ })
      .closest('tr')
    if (!row) throw new Error('no row')
    expect(within(row).getByText('Published')).toBeTruthy()
    expect(within(row).getByText('v2')).toBeTruthy()
    expect(within(row).getByText('1 group')).toBeTruthy()
    expect(within(row).getByText('3')).toBeTruthy()
  })

  it('creates a category with a slug from the label and a CCSR group from the picker', async () => {
    const { creates } = fakeApi()
    await open()
    await user.click(screen.getByRole('button', { name: 'New unified category' }))
    const form = screen.getByRole('form', { name: 'New unified category' })
    await user.type(within(form).getByLabelText('Label'), 'Kidney failure and dialysis')
    expect(within(form).getByLabelText<HTMLInputElement>(/^Slug/).value).toBe(
      'kidney-failure-and-dialysis',
    )
    await user.selectOptions(
      within(form).getByLabelText('Federal parent'),
      'serious_complex_medical',
    )
    await user.type(within(form).getByLabelText('Definition'), 'End-stage kidney disease.')
    await user.type(within(form).getByLabelText('Search CCSR groups'), 'kidney')
    const results = within(form).getByRole('group', { name: 'Genitourinary' })
    await user.click(within(results).getByRole('checkbox', { name: /TST101/ }))
    expect(within(form).getByRole('button', { name: 'Remove TST101' })).toBeTruthy()
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(creates).toEqual([
      {
        label: 'Kidney failure and dialysis',
        slug: 'kidney-failure-and-dialysis',
        federalCategory: 'serious_complex_medical',
        definition: 'End-stage kidney disease.',
        includes: null,
        excludes: null,
        status: 'draft',
        sortOrder: 0,
        ccsr: ['TST101'],
      },
    ])
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('Saved Kidney failure and dialysis'),
    )
  })

  it('says which fields need fixing, and says so when the slug is taken', async () => {
    const { creates } = fakeApi()
    await open()
    await user.click(screen.getByRole('button', { name: 'New unified category' }))
    const form = screen.getByRole('form', { name: 'New unified category' })
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(within(form).getByRole('alert').textContent).toContain(
      'Fix these fields: Label, Slug, Definition, Federal parent.',
    )
    const label = within(form).getByLabelText('Label')
    expect(label.getAttribute('aria-invalid')).toBe('true')
    expect(label.getAttribute('aria-describedby')).toBe(within(form).getByRole('alert').id)
    expect(creates).toEqual([])

    await user.type(within(form).getByLabelText('Label'), 'Serious mental illness')
    await user.type(within(form).getByLabelText('Definition'), 'Anything.')
    await user.selectOptions(
      within(form).getByLabelText('Federal parent'),
      'disabling_mental_disorder',
    )
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect((await within(form).findByRole('alert')).textContent).toContain(
      'The slug "serious-mental-illness" is already used by another unified category',
    )
  })

  it('edits a category, keeping its slug and offering only allowed statuses', async () => {
    const { updates } = fakeApi()
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Serious mental illness' }))
    const form = screen.getByRole('form', { name: 'Edit Serious mental illness' })
    const status = within(form).getByLabelText<HTMLSelectElement>('Status')
    expect([...status.options].map((o) => o.value)).toEqual(['published', 'retired'])
    await user.clear(within(form).getByLabelText('Label'))
    await user.type(within(form).getByLabelText('Label'), 'SMI')
    expect(within(form).getByLabelText<HTMLInputElement>(/^Slug/).value).toBe(
      'serious-mental-illness',
    )
    await user.click(within(form).getByRole('button', { name: 'Remove TST001' }))
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(updates).toEqual([
      {
        path: '/api/admin/unified/1',
        body: expect.objectContaining({
          label: 'SMI',
          slug: 'serious-mental-illness',
          status: 'published',
          ccsr: [],
        }) as unknown,
      },
    ])
  })

  it('retires a draft that was never published', async () => {
    const draft = {
      ...smi,
      id: 2,
      slug: 'draft-psychoses',
      label: 'Draft psychoses',
      status: 'draft',
    }
    const { updates } = fakeApi([smi, draft])
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Draft psychoses' }))
    const form = screen.getByRole('form', { name: 'Edit Draft psychoses' })
    const status = within(form).getByLabelText<HTMLSelectElement>('Status')
    expect([...status.options].map((o) => o.value)).toEqual(['draft', 'published', 'retired'])
    await user.selectOptions(status, 'retired')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(updates).toEqual([
      {
        path: '/api/admin/unified/2',
        body: expect.objectContaining({ status: 'retired' }) as unknown,
      },
    ])
  })
})

describe('/admin/unified: rebuild coverage', () => {
  it('rebuilds every derived table and says how much it found', async () => {
    fakeApi()
    let calls = 0
    server.use(
      http.post('/api/admin/coverage/rebuild', () => {
        calls += 1
        return HttpResponse.json({
          categories: 19,
          universeCodes: 12_034,
          placements: 812,
          similarPairs: 6,
          ms: 4210,
        })
      }),
    )
    await open()
    const region = screen.getByRole('region', { name: 'Rebuild coverage' })
    await user.click(within(region).getByRole('button', { name: 'Rebuild coverage' }))
    expect(
      (await within(region).findByRole('status')).textContent.replace(/\s+/g, ' ').trim(),
    ).toBe(
      'Rebuilt 19 categories: 12,034 codes in their full lists, 812 placements, 6 state pairs (4.2 s).',
    )
    expect(calls).toBe(1)
  })

  it('shows the error when the rebuild fails', async () => {
    fakeApi()
    server.use(
      http.post('/api/admin/coverage/rebuild', () =>
        HttpResponse.json({ error: 'Internal error' }, { status: 500 }),
      ),
    )
    await open()
    const region = screen.getByRole('region', { name: 'Rebuild coverage' })
    await user.click(within(region).getByRole('button', { name: 'Rebuild coverage' }))
    expect((await within(region).findByRole('alert')).textContent).toContain('Internal error')
  })
})
