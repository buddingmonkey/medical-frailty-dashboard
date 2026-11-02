import type { DraftChecksResponse } from '@mfcd/shared'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/msw-server'
import PublishPanel from './PublishPanel.vue'

const counts = { added: 0, removed: 3, descriptionChanged: 0, categoryChanged: 0 }

function checks(canPublish = true): DraftChecksResponse {
  return {
    report: {
      checks: [
        { id: 'empty', level: 'block', triggered: !canPublish, message: 'The draft has no rows.' },
        {
          id: 'large_change',
          level: 'confirm_typed',
          triggered: true,
          message: '3 of 4 published codes (75.0%) are gone.',
        },
        {
          id: 'unresolved_flags',
          level: 'confirm',
          triggered: true,
          message: '2 rows still have review flags that nobody accepted.',
          count: 2,
        },
        { id: 'duplicates', level: 'info', triggered: true, message: '1 rows repeat a code.' },
      ],
      canPublish,
      diff: { totals: counts, bySystem: { icd10cm: counts }, changes: [] },
    },
    token: 'c'.repeat(64),
    ranAt: '2026-11-02T15:00:00.000Z',
    hasPublished: true,
  }
}

function setup(result = checks()) {
  const sent: unknown[] = []
  server.use(
    http.post('/api/admin/drafts/7/publish', async ({ request }) => {
      sent.push(await request.json())
      return HttpResponse.json({ ok: true, backupKey: 'backups/MT/3.json' })
    }),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rendered = render(PublishPanel, {
    props: { versionId: 7, versionNo: 4, stateId: 'MT', stateName: 'Montana', checks: result },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  })
  return { user: userEvent.setup(), sent, emitted: () => rendered.emitted() }
}

const publishButton = () => screen.getByRole('button', { name: 'Publish draft v4' })

describe('PublishPanel', () => {
  it('asks for each confirmation and the typed state code before publishing', async () => {
    const { user, sent, emitted } = setup()
    expect(publishButton().hasAttribute('disabled')).toBe(true)

    await user.click(screen.getByRole('checkbox', { name: /2 rows still have review flags/ }))
    expect(publishButton().hasAttribute('disabled')).toBe(true)
    const typed = screen.getByRole('textbox', {
      name: /Type MT to confirm: 3 of 4 published codes/,
    })
    await user.type(typed, 'NE')
    expect(publishButton().hasAttribute('disabled')).toBe(true)
    await user.clear(typed)
    await user.type(typed, 'mt')
    expect(publishButton().hasAttribute('disabled')).toBe(false)

    await user.click(publishButton())
    expect(
      await screen.findByText(/Published\. Draft v4 is now Montana’s public list/),
    ).toBeTruthy()
    expect(sent).toEqual([
      {
        token: 'c'.repeat(64),
        confirmations: { large_change: { typed: 'mt' }, unresolved_flags: {} },
      },
    ])
    expect(emitted()['published']).toHaveLength(1)
  })

  it('cannot publish while a check blocks', () => {
    setup(checks(false))
    expect(screen.getByText(/A check blocks publishing/)).toBeTruthy()
    expect(publishButton().hasAttribute('disabled')).toBe(true)
  })

  it('says to run the checks again when the rows changed', async () => {
    const { user } = setup({ ...checks(), report: { ...checks().report, checks: [] } })
    server.use(
      http.post('/api/admin/drafts/7/publish', () =>
        HttpResponse.json(
          { error: 'The rows changed since the checks ran. Run the checks again.' },
          { status: 409 },
        ),
      ),
    )
    await user.click(publishButton())
    expect((await screen.findByRole('alert')).textContent).toContain('Run the checks again')
  })
})
