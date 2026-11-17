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

const recordHint =
  'Basis, confidence, rationale and citation are for the record; they do not change counts.'

describe('MappingForm field help', () => {
  it('says once that the record fields change no counts, and lets the fields enforce lengths', () => {
    setup()

    expect(screen.getAllByText(recordHint)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^About / })).toBeNull()
    expect(
      screen.getByRole('combobox', { name: 'Basis for target 1', description: recordHint }),
    ).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Rationale for target 1' })).toHaveProperty(
      'maxLength',
      4000,
    )
    expect(screen.getByRole('textbox', { name: 'Citation for target 1' })).toHaveProperty(
      'maxLength',
      1000,
    )
    expect(screen.queryByText(/characters/)).toBeNull()
  })

  it('keeps the same hint and limits when placing each code by its CCSR group', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('radio', { name: 'Place each code by its CCSR group' }))

    expect(screen.getByRole('combobox', { name: 'Basis', description: recordHint })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Rationale' })).toHaveProperty('maxLength', 4000)
    expect(screen.getByRole('textbox', { name: 'Citation' })).toHaveProperty('maxLength', 1000)
  })

  it('warns beside Save and approve that public pages change at once', () => {
    setup()

    expect(
      screen.getByRole('button', {
        name: 'Save and approve',
        description: 'Approving changes public pages at once.',
      }),
    ).toBeTruthy()
  })
})
