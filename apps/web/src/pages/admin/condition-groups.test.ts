import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

// Condition groups (roadmap M6 step 4).

const cancer = {
  id: 1,
  slug: 'cancer',
  name: 'Cancer and chemotherapy',
  definition: 'Malignant cancers and their treatment.',
  sources: 'ICD-10-CM Chapter 2. First draft by an AI assistant; check before publishing.',
  status: 'draft',
  updatedBy: 'migration 0014',
  updatedAt: '2026-11-03T15:00:00.000Z',
  members: [
    {
      id: 1,
      codeSystem: 'cpt',
      matchKind: 'range',
      codeNorm: '96401',
      rangeEndNorm: '96549',
      text: '96401-96549',
    },
    {
      id: 2,
      codeSystem: 'icd10cm',
      matchKind: 'range',
      codeNorm: 'C00',
      rangeEndNorm: 'C96',
      text: 'C00-C96',
    },
  ],
}

function fakeApi() {
  const creates: unknown[] = []
  const updates: { path: string; body: unknown }[] = []
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/condition-groups', () => HttpResponse.json({ items: [cancer] })),
    http.post('/api/admin/condition-groups', async ({ request }) => {
      creates.push(await request.json())
      return HttpResponse.json(
        {
          error: 'Member 1 (CPT): C50: The code does not fit the code system set for this column.',
        },
        { status: 400 },
      )
    }),
    http.put('/api/admin/condition-groups/:id', async ({ request }) => {
      updates.push({ path: new URL(request.url).pathname, body: await request.json() })
      return HttpResponse.json({ id: 1, slug: 'cancer', members: 3 })
    }),
  )
  return { creates, updates }
}

let user: ReturnType<typeof userEvent.setup>

async function open() {
  user = userEvent.setup()
  await renderRoute('/admin/condition-groups')
  return screen.findByRole('table', { name: 'Condition groups' })
}

describe('/admin/condition-groups', () => {
  it('lists the groups with their status, code systems and members', async () => {
    fakeApi()
    const table = await open()
    const row = within(table)
      .getByRole('rowheader', { name: /Cancer and chemotherapy/ })
      .closest('tr')
    if (!row) throw new Error('no row')
    expect(within(row).getByText('Draft')).toBeTruthy()
    expect(within(row).getByText('CPT, ICD-10-CM')).toBeTruthy()
    expect(within(row).getByText('2')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Condition groups' })).toBeTruthy()
  })

  it('edits a group: adds and removes members, then saves the whole list', async () => {
    const { updates } = fakeApi()
    await open()
    await user.click(screen.getByRole('button', { name: 'Edit Cancer and chemotherapy' }))
    const form = screen.getByRole('form', { name: 'Edit Cancer and chemotherapy' })
    await user.click(within(form).getByRole('button', { name: 'Remove member 1' }))
    await user.click(within(form).getByRole('button', { name: 'Add member' }))
    await user.selectOptions(within(form).getByLabelText('Code system, member 2'), 'hcpcs')
    await user.type(within(form).getByLabelText('Codes, member 2'), 'J9000-J9999')
    await user.selectOptions(within(form).getByLabelText('Status'), 'published')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Saved Cancer and chemotherapy (3 members).')).toBeTruthy()
    expect(updates).toEqual([
      {
        path: '/api/admin/condition-groups/1',
        body: {
          name: 'Cancer and chemotherapy',
          slug: 'cancer',
          definition: 'Malignant cancers and their treatment.',
          sources: cancer.sources,
          status: 'published',
          members: [
            { codeSystem: 'icd10cm', text: 'C00-C96' },
            { codeSystem: 'hcpcs', text: 'J9000-J9999' },
          ],
        },
      },
    ])
  })

  it('names a member it cannot read, without sending', async () => {
    const { creates } = fakeApi()
    await open()
    await user.click(screen.getByRole('button', { name: 'New condition group' }))
    const form = screen.getByRole('form', { name: 'New condition group' })
    await user.type(within(form).getByLabelText('Name'), 'Test')
    await user.click(within(form).getByRole('button', { name: 'Add member' }))
    await user.selectOptions(within(form).getByLabelText('Code system, member 1'), 'cpt')
    await user.type(within(form).getByLabelText('Codes, member 1'), 'C50')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect((await within(form).findByRole('alert')).textContent).toMatch(/Member 1: C50: /)
    expect(creates).toEqual([])
  })
})
