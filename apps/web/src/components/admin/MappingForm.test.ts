import type { StateUnifiedCategory } from '@mfcd/shared'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import '../../test/ui-sdk-stubs'

import MappingForm from './MappingForm.vue'

const category: StateUnifiedCategory = {
  stateCategory: 'Behavioral Health',
  stateSubcategory: '',
  entries: 4,
  icdEntries: 3,
  mappings: [],
  suggestion: { ccsr: [], unified: [], withoutCcsr: 3 },
}

function setup() {
  const user = userEvent.setup()
  render(MappingForm, { props: { category, unified: [] } })
  return { user }
}

describe('MappingForm field help', () => {
  it('explains basis, confidence, rationale and citation of a target', () => {
    setup()

    for (const field of ['Basis', 'Confidence', 'Rationale', 'Citation']) {
      expect(screen.getByRole('button', { name: `About ${field} for target 1` })).toBeTruthy()
    }
    expect(
      screen.getByRole('button', {
        name: 'About Basis for target 1',
        description: /does not change/,
      }),
    ).toBeTruthy()
  })

  it('explains the same fields when placing each code by its CCSR group', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('radio', { name: 'Place each code by its CCSR group' }))

    for (const field of ['Basis', 'Confidence', 'Rationale', 'Citation']) {
      expect(screen.getByRole('button', { name: `About ${field}` })).toBeTruthy()
    }
    expect(screen.getByRole('combobox', { name: 'Basis' })).toBeTruthy()
  })
})
