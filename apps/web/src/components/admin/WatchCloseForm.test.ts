import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import WatchCloseForm from './WatchCloseForm.vue'

describe('WatchCloseForm field help', () => {
  it('explains the outcome and the resolution note', () => {
    render(WatchCloseForm)

    expect(
      screen.getByRole('button', { name: 'About Outcome', description: /History/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'About Resolution note', description: /History/ }),
    ).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Done' })).toBeTruthy()
    const note = screen.getByRole('textbox', {
      name: 'Resolution note',
      description: '0 / 4,000 characters',
    })
    expect(note.getAttribute('maxlength')).toBe('4000')
  })
})
