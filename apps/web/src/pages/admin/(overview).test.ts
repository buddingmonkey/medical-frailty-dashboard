import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { localToday } from '../../lib/admin-watch'
import { server } from '../../test/msw-server'
import { renderRoute } from '../../test/render-route'

const whoami = http.get('/api/admin/whoami', () =>
  HttpResponse.json({ email: 'admin@example.org' }),
)

function readiness(stateId: string, name: string, n: { unconfirmed: number; auto: number }) {
  return {
    stateId,
    name,
    versionId: 7,
    versionNo: 2,
    publishedAt: '2026-11-02T10:00:00.000Z',
    categories: 4,
    unified: { unmapped: n.unconfirmed > 0 ? 1 : 0, unconfirmed: n.unconfirmed },
    federal: { unmapped: 0, auto: n.auto },
    notReviewed: 0,
    ready: false,
  }
}

function watchItem(id: number, stateId: string | null, dueDate: string | null) {
  return {
    id,
    title: `Item ${String(id)}`,
    kind: 'state_list',
    stateId,
    dueDate,
    dateIsApproximate: false,
    whyMd: '',
    links: [],
    repeatDays: null,
    status: 'open',
    resolutionMd: null,
    resolvedBy: null,
    resolvedAt: null,
    createdBy: 'admin@example.org',
    createdAt: '2026-11-01T10:00:00.000Z',
  }
}

describe('/admin overview', () => {
  beforeEach(() => {
    server.use(
      whoami,
      http.get('/api/admin/launch-readiness', () =>
        HttpResponse.json({
          states: [
            readiness('GA', 'Georgia', { unconfirmed: 2, auto: 5 }),
            readiness('MT', 'Montana', { unconfirmed: 0, auto: 0 }),
          ],
          readyCount: 0,
          required: 2,
          gatePassed: false,
        }),
      ),
      http.get('/api/admin/drafts', ({ request }) => {
        const stateId = new URL(request.url).searchParams.get('stateId')
        const items =
          stateId === 'GA'
            ? [
                {
                  id: 41,
                  stateId: 'GA',
                  versionNo: 3,
                  status: 'draft',
                  label: null,
                  createdBy: 'admin@example.org',
                  createdAt: '2026-11-10T10:00:00.000Z',
                  rowCount: 12,
                },
              ]
            : []
        return HttpResponse.json({ items })
      }),
      http.get('/api/admin/watch', () =>
        HttpResponse.json({
          items: [watchItem(1, 'GA', localToday()), watchItem(2, 'MT', null)],
        }),
      ),
    )
  })

  it('lists the steps to add a state, with links that use the nav’s names', async () => {
    await renderRoute('/admin')

    const heading = await screen.findByRole('heading', { level: 2, name: 'Overview' })
    const section = heading.closest('section')
    if (!section) throw new Error('no section')
    expect(section.textContent).toContain('Nothing is public until a draft is published')

    const nav = screen.getByRole('navigation', { name: 'Admin' })
    const steps = within(section).getByRole('list', { name: 'Steps' })
    const names = ['Source files', 'Read and map', 'Drafts', 'Mappings', 'Federal categories']
    expect(
      within(steps)
        .getAllByRole('link')
        .map((l) => l.textContent.trim()),
    ).toEqual(names)
    for (const name of [...names, 'Audit log', 'Guide']) {
      const link = within(section).getAllByRole('link', { name })[0]
      expect(link?.getAttribute('href')).toBe(
        within(nav).getByRole('link', { name }).getAttribute('href'),
      )
    }
  })

  it('shows a status board per published state, each count linking to its screen', async () => {
    await renderRoute('/admin')

    const table = await screen.findByRole('table', { name: 'Status by state' })
    const [ga, mt] = within(table).getAllByRole('row').slice(1)
    if (!ga || !mt) throw new Error('rows')

    expect((await within(ga).findByRole('link', { name: 'Version 3' })).getAttribute('href')).toBe(
      '/admin/drafts/41',
    )
    expect(within(ga).getByRole('link', { name: '3' }).getAttribute('href')).toBe('/admin/mappings')
    expect(within(ga).getByRole('link', { name: '5' }).getAttribute('href')).toBe(
      '/admin/categories',
    )
    expect(within(ga).getByRole('link', { name: '1' }).getAttribute('href')).toBe('/admin/watch')
    expect(ga.textContent).toContain('Version 2')

    expect(await within(mt).findByText('None')).toBeTruthy()
    expect(within(mt).queryAllByRole('link')).toHaveLength(0)
  })
})
