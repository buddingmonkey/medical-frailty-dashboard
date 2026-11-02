import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../../../test/msw-server'
import { renderRoute } from '../../../test/render-route'

const detail = (status = 'draft') => ({
  id: 7,
  stateId: 'MT',
  versionNo: 3,
  status,
  label: null,
  createdBy: 'admin@example.org',
  createdAt: '2026-11-02T14:00:00.000Z',
  rowCount: 312,
  parts: [
    {
      sourceDocumentId: 11,
      part: 'Pages 1–8',
      title: 'DPHHS Medically Frail Condition List',
      sha256: 'a'.repeat(64),
      expectedEntries: 314,
      storedEntries: 312,
      invalidRowCount: 3,
      namedStateIds: ['MT'],
    },
  ],
})

const counts = (added: number, removed = 0) => ({
  added,
  removed,
  descriptionChanged: 0,
  categoryChanged: 0,
})

const checks = {
  report: {
    checks: [
      { id: 'empty', level: 'block', triggered: false, message: 'The draft has no rows.' },
      {
        id: 'incomplete_upload',
        level: 'block',
        triggered: true,
        message: 'Not every row arrived for: DPHHS Medically Frail Condition List.',
        count: 1,
      },
      {
        id: 'unresolved_flags',
        level: 'confirm',
        triggered: true,
        message: '37 rows still have review flags that nobody accepted.',
        count: 37,
      },
      {
        id: 'duplicates',
        level: 'info',
        triggered: true,
        message: '2 rows repeat a code already listed under the same category.',
        count: 2,
      },
    ],
    canPublish: false,
    diff: {
      totals: counts(2, 1),
      bySystem: { icd10cm: counts(2, 1), cpt: counts(0) },
      changes: [
        { kind: 'added', codeSystem: 'icd10cm', code: 'F20.0', before: null, after: 'SMI' },
        { kind: 'added', codeSystem: 'icd10cm', code: 'F31.0', before: null, after: 'SMI' },
        { kind: 'removed', codeSystem: 'icd10cm', code: 'F32.9', before: 'SMI', after: null },
      ],
    },
  },
  token: 'b'.repeat(64),
  ranAt: '2026-11-02T14:05:00.000Z',
  hasPublished: true,
}

function fakeApi() {
  const calls = { checks: 0, discards: 0 }
  let status = 'draft'
  server.use(
    http.get('/api/admin/whoami', () => HttpResponse.json({ email: 'admin@example.org' })),
    http.get('/api/admin/watch', () => HttpResponse.json({ items: [] })),
    http.get('/api/admin/states', () =>
      HttpResponse.json({ items: [{ id: 'MT', name: 'Montana', status: 'none' }] }),
    ),
    http.get('/api/admin/drafts/7', () => HttpResponse.json(detail(status))),
    http.get('/api/admin/drafts/7/checks', () => {
      calls.checks++
      return HttpResponse.json(checks)
    }),
    http.post('/api/admin/drafts/7/discard', () => {
      calls.discards++
      status = 'discarded'
      return HttpResponse.json({ ok: true })
    }),
  )
  return calls
}

let user: ReturnType<typeof userEvent.setup>

describe('/admin/drafts/[versionId]', () => {
  beforeEach(() => {
    user = userEvent.setup()
  })

  it('shows the draft, its sources and what arrived', async () => {
    fakeApi()
    await renderRoute('/admin/drafts/7')
    expect(await screen.findByRole('heading', { name: 'Montana: draft v3' })).toBeTruthy()
    const sources = screen.getByRole('table', { name: 'Source files in this draft' })
    const [, first] = within(sources).getAllByRole('row')
    expect(first?.textContent).toContain('DPHHS Medically Frail Condition List')
    expect(first?.textContent).toContain('Pages 1–8')
    expect(first?.textContent).toContain('312 of 314')
  })

  it('lists the checks that fired by level, and the ones that passed', async () => {
    fakeApi()
    await renderRoute('/admin/drafts/7')
    expect(await screen.findByText(/Publishing is blocked/)).toBeTruthy()
    const blocking = screen.getByRole('list', { name: 'Blocks publishing' })
    expect(within(blocking).getByText(/Not every row arrived/)).toBeTruthy()
    const confirm = screen.getByRole('list', { name: 'Needs a confirmation' })
    expect(within(confirm).getByText(/37 rows still have review flags/)).toBeTruthy()
    expect(screen.getByRole('list', { name: 'For information' })).toBeTruthy()
    expect(screen.getByText('1 check passed')).toBeTruthy()
  })

  it('shows the diff per code system and lists the changes', async () => {
    fakeApi()
    await renderRoute('/admin/drafts/7')
    const totals = await screen.findByRole('table', { name: 'Changes by code system' })
    const icd = within(totals).getByRole('row', { name: /ICD-10-CM/ })
    expect(icd.textContent).toMatch(/ICD-10-CM\s*2\s*1\s*0\s*0/)

    const changes = screen.getByRole('table', { name: 'Changed codes' })
    expect(within(changes).getAllByRole('row')).toHaveLength(4)
    await user.selectOptions(screen.getByLabelText('Show changes'), 'Removed')
    expect(within(changes).getAllByRole('row')).toHaveLength(2)
    expect(within(changes).getByText('F32.9')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download the diff (CSV)' })).toBeTruthy()
  })

  it('runs the checks again on request', async () => {
    const calls = fakeApi()
    await renderRoute('/admin/drafts/7')
    await screen.findByText(/Publishing is blocked/)
    await user.click(screen.getByRole('button', { name: 'Run the checks again' }))
    await expect.poll(() => calls.checks).toBe(2)
  })

  it('discards the draft after a second click', async () => {
    const calls = fakeApi()
    await renderRoute('/admin/drafts/7')
    await user.click(await screen.findByRole('button', { name: 'Discard this draft' }))
    expect(calls.discards).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Yes, discard draft v3' }))
    expect(await screen.findByText(/This draft was discarded/)).toBeTruthy()
    expect(calls.discards).toBe(1)
    expect(screen.queryByRole('button', { name: 'Discard this draft' })).toBeNull()
  })

  it('says when the draft does not exist', async () => {
    fakeApi()
    server.use(
      http.get('/api/admin/drafts/7', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    await renderRoute('/admin/drafts/7')
    expect(await screen.findByText(/No draft with this number/)).toBeTruthy()
  })
})
