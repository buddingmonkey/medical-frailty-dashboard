import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import CompareStatesField from './CompareStatesField.vue'

// The state picker on Compare single codes (project lead, 2026-11-13): a disclosure with
// presets, a name filter and a grid of checkboxes, as GOV.UK's "option select".

const choices = [
  { id: 'GA', name: 'Georgia' },
  { id: 'MS', name: 'Mississippi' },
  { id: 'MO', name: 'Missouri' },
  { id: 'MT', name: 'Montana' },
  { id: 'NE', name: 'Nebraska' },
]

function renderField(initial: string[] = []) {
  const states = ref<string[]>([...initial])
  const utils = render(
    defineComponent({
      setup: () => () =>
        h(CompareStatesField, {
          states: states.value,
          'onUpdate:states': (v: string[]) => (states.value = v),
          choices,
          legend: 'States to compare',
        }),
    }),
  )
  const details = () => {
    const el = utils.container.querySelector('details')
    if (!el) throw new Error('no details')
    return el
  }
  return { states, details }
}

const group = () => screen.getByRole('group', { name: 'States to compare' })
const boxNames = () =>
  within(group())
    .getAllByRole('checkbox')
    .map((b) => b.getAttribute('aria-label') ?? b.closest('label')?.textContent.trim())

describe('CompareStatesField', () => {
  it('starts open when no state is chosen, and says none are', () => {
    const { details } = renderField()
    expect(details().open).toBe(true)
    expect(details().querySelector('summary')?.textContent).toMatch(
      /States to compare:\s*None chosen/,
    )
  })

  it('starts closed when states are chosen, and names them in the summary', () => {
    const { details } = renderField(['NE', 'GA', 'MT'])
    expect(details().open).toBe(false)
    expect(details().querySelector('summary')?.textContent).toMatch(
      /States to compare:\s*3 chosen \(Georgia, Montana, Nebraska\)/,
    )
  })

  it('shortens a long list in the summary', () => {
    const { details } = renderField(['GA', 'MS', 'MO', 'MT', 'NE'])
    expect(details().querySelector('summary')?.textContent).toContain(
      '5 chosen (Georgia, Mississippi, Missouri and 2 more)',
    )
  })

  it('keeps the choice alphabetical by name, whatever the order of the clicks', async () => {
    const user = userEvent.setup()
    const { states } = renderField()
    await user.click(screen.getByRole('checkbox', { name: 'Nebraska' }))
    await user.click(screen.getByRole('checkbox', { name: 'Montana' }))
    await user.click(screen.getByRole('checkbox', { name: 'Missouri' }))
    await user.click(screen.getByRole('checkbox', { name: 'Mississippi' }))
    expect(states.value).toEqual(['MS', 'MO', 'MT', 'NE'])
    await user.click(screen.getByRole('checkbox', { name: 'Montana' }))
    expect(states.value).toEqual(['MS', 'MO', 'NE'])
  })

  it('filters by name, case-insensitive, but keeps checked states visible', async () => {
    const user = userEvent.setup()
    renderField(['GA'])
    await user.click(screen.getByText('States to compare:'))
    await user.type(screen.getByLabelText('Filter states'), 'mIs')
    expect(boxNames()).toEqual(['Georgia', 'Mississippi', 'Missouri'])
    expect(screen.getByRole('status').textContent).toContain('3 states shown')

    await user.clear(screen.getByLabelText('Filter states'))
    await user.type(screen.getByLabelText('Filter states'), 'montana')
    expect(boxNames()).toEqual(['Georgia', 'Montana'])
    expect(screen.getByRole('status').textContent).toContain('2 states shown')
  })

  it('counts every state shown before any filter', () => {
    renderField()
    expect(screen.getByRole('status').textContent).toContain('5 states shown')
  })

  it('chooses every state with one button and clears them with another', async () => {
    const user = userEvent.setup()
    const { states, details } = renderField()
    await user.click(screen.getByRole('button', { name: 'All states with a list' }))
    expect(states.value).toEqual(['GA', 'MS', 'MO', 'MT', 'NE'])
    expect(
      within(group())
        .getAllByRole<HTMLInputElement>('checkbox')
        .every((b) => b.checked),
    ).toBe(true)
    expect(details().querySelector('summary')?.textContent).toContain('5 chosen')

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(states.value).toEqual([])
    expect(
      within(group())
        .getAllByRole<HTMLInputElement>('checkbox')
        .some((b) => b.checked),
    ).toBe(false)
  })

  it('works with Tab and Space alone', async () => {
    const user = userEvent.setup()
    const { states } = renderField()
    screen.getByRole('button', { name: 'All states with a list' }).focus()
    await user.tab() // Clear
    await user.tab() // Filter
    await user.tab() // Georgia
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Georgia' }))
    await user.keyboard(' ')
    expect(states.value).toEqual(['GA'])
  })
})
