import type { WatchCreate, WatchItem } from '@mfcd/shared'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import WatchItemForm from './WatchItemForm.vue'

describe('WatchItemForm field help', () => {
  it('explains the due date, repeat, approximate date and why it matters', () => {
    render(WatchItemForm)

    expect(
      screen.getByRole('button', { name: 'About Due date', description: /No date yet/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'About Repeat every (days)',
        description: /days later/,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'About The date is approximate',
        description: /“approximate”/,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'About Why it matters',
        description: /next item when the item repeats/,
      }),
    ).toBeTruthy()
    // The limit is enforced and counted, not described.
    const why = screen.getByRole('textbox', {
      name: 'Why it matters',
      description: '0 / 4,000 characters',
    })
    expect(why.getAttribute('maxlength')).toBe('4000')
  })

  it('keeps the fields named by their labels', () => {
    render(WatchItemForm)

    expect(screen.getByLabelText('Due date')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Repeat every (days)' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'The date is approximate' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Why it matters' })).toBeTruthy()
  })
})

const states = [
  { id: 'CT', name: 'Connecticut' },
  { id: 'NE', name: 'Nebraska' },
]

const ctItem: WatchItem = {
  id: 7,
  title: 'Connecticut list review',
  kind: 'state_list',
  stateId: 'CT',
  dueDate: '2026-12-15',
  dateIsApproximate: false,
  whyMd: 'The state may revise its list.',
  links: [],
  repeatDays: null,
  status: 'open',
  resolutionMd: null,
  resolvedBy: null,
  resolvedAt: null,
  createdBy: 'admin@example.org',
  createdAt: '2026-11-01T22:00:00.000Z',
}

/** The fields of each save the form emitted. */
const saved = (rendered: ReturnType<typeof render>) => rendered.emitted<[WatchCreate]>('save')

describe('WatchItemForm state', () => {
  it('submits the chosen state', async () => {
    const user = userEvent.setup()
    const rendered = render(WatchItemForm, { props: { states } })

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Nebraska rule')
    await user.type(screen.getByRole('textbox', { name: 'Why it matters' }), 'A new rule.')
    await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'Nebraska')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(saved(rendered)[0]?.[0]).toMatchObject({ stateId: 'NE' })
  })

  it('submits null when None is chosen', async () => {
    const user = userEvent.setup()
    const rendered = render(WatchItemForm, { props: { states, item: ctItem } })

    await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'None')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(saved(rendered)[0]?.[0]).toMatchObject({ stateId: null })
  })

  it('shows an item’s state selected and saves it unchanged', async () => {
    const user = userEvent.setup()
    const rendered = render(WatchItemForm, { props: { states, item: ctItem } })

    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'State' })
    expect(select.selectedOptions[0]?.textContent.trim()).toBe('Connecticut')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(saved(rendered)[0]?.[0]).toMatchObject({ stateId: 'CT' })
  })

  it('keeps an item’s state before the state list loads', async () => {
    const user = userEvent.setup()
    const rendered = render(WatchItemForm, { props: { item: ctItem } })

    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'State' })
    expect(select.value).not.toBe('')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(saved(rendered)[0]?.[0]).toMatchObject({ stateId: 'CT' })
  })
})
