import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import WatchItemForm from './WatchItemForm.vue'

describe('WatchItemForm field help', () => {
  it('explains the due date, repeat, approximate date and why it matters', () => {
    render(WatchItemForm)

    expect(
      screen.getByRole('button', { name: 'About Due date', description: /Overdue/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'About Repeat every (days)',
        description: /after the close date/,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'About The date is approximate',
        description: /does not change/,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'About Why it matters', description: /plain text/ }),
    ).toBeTruthy()
  })

  it('keeps the fields named by their labels', () => {
    render(WatchItemForm)

    expect(screen.getByLabelText('Due date')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Repeat every (days)' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'The date is approximate' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Why it matters' })).toBeTruthy()
  })
})
