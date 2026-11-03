import type { SourceDetailsDraft } from '@mfcd/shared'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import SourceDetailsForm from './SourceDetailsForm.vue'

/** Renders the form with a v-model, as the sources page does. */
function renderForm(initial: SourceDetailsDraft, props: { saving?: boolean; error?: string } = {}) {
  const draft = ref<SourceDetailsDraft>({ ...initial })
  const saved: unknown[] = []
  let cancelled = 0
  render(
    defineComponent({
      setup: () => () =>
        h(SourceDetailsForm, {
          modelValue: draft.value,
          'onUpdate:modelValue': (v: SourceDetailsDraft) => (draft.value = v),
          label: 'Edit details of “GA list”',
          ...props,
          onSave: (details: unknown) => saved.push(details),
          onCancel: () => (cancelled += 1),
        }),
    }),
  )
  return { draft, saved, cancelled: () => cancelled }
}

const empty: SourceDetailsDraft = { title: 'GA list', url: '', publisherDate: '' }

describe('SourceDetailsForm', () => {
  it('saves the title, an https URL and a date, trimmed', async () => {
    const user = userEvent.setup()
    const { saved, draft } = renderForm(empty)

    await user.type(
      screen.getByLabelText('State’s URL for this file'),
      ' https://dch.ga.gov/a.pdf ',
    )
    await user.type(screen.getByLabelText('Date on the document'), '2026-07-01')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(saved).toEqual([
      { title: 'GA list', url: 'https://dch.ga.gov/a.pdf', publisherDate: '2026-07-01' },
    ])
    // The inputs write through v-model, so the page keeps the draft.
    expect(draft.value.url.trim()).toBe('https://dch.ga.gov/a.pdf')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends null for a blank URL and date', async () => {
    const user = userEvent.setup()
    const { saved } = renderForm({ title: 'GA list', url: 'https://a.gov/x', publisherDate: '' })

    await user.clear(screen.getByLabelText('State’s URL for this file'))
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(saved).toEqual([{ title: 'GA list', url: null, publisherDate: null }])
  })

  it('shows a message by each bad field and does not save', async () => {
    const user = userEvent.setup()
    const { saved } = renderForm(empty)

    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('State’s URL for this file'), 'http://dch.ga.gov/a.pdf')
    await user.type(screen.getByLabelText('Date on the document'), '2999-01-01')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(saved).toEqual([])
    expect(screen.getByText('Enter a title.')).toBeTruthy()
    expect(screen.getByText('Enter a full https:// address.')).toBeTruthy()
    expect(screen.getByText('The date cannot be in the future.')).toBeTruthy()
    expect(screen.getByLabelText('Title').getAttribute('aria-invalid')).toBe('true')
  })

  it('shows the server’s error, and cancels', async () => {
    const user = userEvent.setup()
    const { cancelled } = renderForm(empty, { error: 'Not found' })

    expect(screen.getByRole('alert').textContent).toContain('Could not save: Not found')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelled()).toBe(1)
  })

  it('disables save while saving', () => {
    renderForm(empty, { saving: true })
    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true)
  })
})
