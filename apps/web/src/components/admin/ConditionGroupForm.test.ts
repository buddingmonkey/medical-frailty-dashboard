import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import ConditionGroupForm from './ConditionGroupForm.vue'

describe('ConditionGroupForm field help', () => {
  it('explains name, slug and definition with info buttons', () => {
    render(ConditionGroupForm)

    expect(
      screen.getByRole('button', { name: 'About Name', description: /Like codes/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'About Slug', description: /not part of any public/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'About Definition',
        description: /only the group’s name/,
      }),
    ).toBeTruthy()
  })

  it('keeps the fields named by their labels and the slug help wiring', () => {
    render(ConditionGroupForm)

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy()
    expect(
      screen.getByRole('textbox', {
        name: 'Slug',
        description: 'Lowercase letters, digits and hyphens. Must be unique.',
      }),
    ).toBeTruthy()
  })
})
