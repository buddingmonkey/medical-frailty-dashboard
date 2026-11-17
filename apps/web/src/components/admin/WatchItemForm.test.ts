import { render, screen } from '@testing-library/vue'
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
      screen.getByRole('button', { name: 'About Why it matters', description: /next repeat/ }),
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
