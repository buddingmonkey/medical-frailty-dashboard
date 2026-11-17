import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import ConditionGroupForm from './ConditionGroupForm.vue'

describe('ConditionGroupForm field help', () => {
  it('explains name and definition with info buttons, and the slug with its hint only', () => {
    render(ConditionGroupForm)

    expect(
      screen.getByRole('button', { name: 'About Name', description: /Like codes/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'About Definition', description: 'Admins only.' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'About Slug' })).toBeNull()
  })

  it('keeps the CPT licensing rule visible on the sources field', () => {
    render(ConditionGroupForm)

    expect(
      screen.getByRole('textbox', {
        name: 'Sources',
        description: /For CPT, code numbers only, never the AMA’s descriptions\./,
      }),
    ).toHaveProperty('maxLength', 4000)
  })

  it('keeps the fields named by their labels and the slug help wiring', () => {
    render(ConditionGroupForm)

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy()
    expect(
      screen.getByRole('textbox', {
        name: 'Slug',
        description: 'Lowercase letters, digits and hyphens. Must be unique. Not public.',
      }),
    ).toBeTruthy()
  })
})
