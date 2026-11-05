import type { MaintenanceRun, MaintenanceStatus } from '@mfcd/shared'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import MaintenancePanel from './MaintenancePanel.vue'

const ok = (counts: Record<string, number>) => ({
  status: 'ok' as const,
  ms: 5,
  counts,
  error: null,
})

const run: MaintenanceRun = {
  startedAt: '2026-11-08T07:00:00.000Z',
  finishedAt: '2026-11-08T07:00:02.000Z',
  trigger: 'cron',
  parts: {
    weeklyDump: { status: 'failed', ms: 3, counts: {}, error: 'R2 is down' },
    pruneWeeklyDumps: ok({ deleted: 1, kept: 12 }),
    prunePublishBackups: ok({ deleted: 0, kept: 40, states: 2 }),
    draftCleanup: ok({
      draftsDeleted: 2,
      discardedEmptied: 1,
      entriesDeleted: 300,
      sourcesDeleted: 0,
      left: 0,
    }),
  },
}

function setup(status: MaintenanceStatus) {
  let current = status
  let posts = 0
  server.use(
    http.get('/api/admin/maintenance', () => HttpResponse.json(current)),
    http.post('/api/admin/maintenance', () => {
      posts++
      const manual: MaintenanceRun = { ...run, trigger: 'manual' }
      current = { ...current, last: manual }
      return HttpResponse.json(manual)
    }),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(MaintenancePanel, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })
  return { user: userEvent.setup(), posts: () => posts }
}

describe('MaintenancePanel', () => {
  it('shows the last run, each part’s result and the saved backups', async () => {
    setup({
      last: run,
      weekly: [
        { date: '2026-11-08', size: 1_250_000, uploadedAt: '2026-11-08T07:00:01.000Z' },
        { date: '2026-11-01', size: 900, uploadedAt: '2026-11-01T07:00:01.000Z' },
      ],
    })
    const parts = await screen.findByRole('list', { name: 'Last run, part by part' })
    const items = within(parts).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]?.textContent).toContain('Backup saved')
    expect(items[0]?.textContent).toContain('Failed')
    expect(items[0]?.textContent).toContain('R2 is down')
    expect(items[3]?.textContent).toContain('2 drafts deleted')
    expect(items[3]?.textContent).toContain('300 entries deleted')
    expect(screen.getByText(/Scheduled run/)).toBeTruthy()

    const table = screen.getByRole('table', { name: 'Saved backups' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1]?.textContent).toContain('1.3 MB')
    const link = within(table).getByRole('link', {
      name: 'Download the backup of 2026-11-08',
    })
    expect(link.getAttribute('href')).toBe('/api/admin/backup/weekly/2026-11-08')
    expect(rows[2]?.textContent).toContain('900 B')
  })

  it('says so when nothing has run yet', async () => {
    setup({ last: null, weekly: [] })
    expect(await screen.findByText('Maintenance has not run yet.')).toBeTruthy()
    expect(screen.getByText('No saved backups yet.')).toBeTruthy()
  })

  it('warns what it deletes, runs on click and shows the new run', async () => {
    const { user, posts } = setup({ last: null, weekly: [] })
    await screen.findByText('Maintenance has not run yet.')
    expect(screen.getByText(/deletes open drafts with no activity for 30 days/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Run maintenance now' }))

    expect(await screen.findByText(/Run by hand/)).toBeTruthy()
    expect(posts()).toBe(1)
  })
})
