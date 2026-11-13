import type { DrillDetailResponse } from '@mfcd/shared'
import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import DrillDetails from './DrillDetails.vue'

const none = { match: null, narrowerCount: 0 }

const detail: DrillDetailResponse = {
  dataVersion: 1,
  row: {
    key: 'icd10cm|exact|F200',
    codeSystem: 'icd10cm',
    codeNorm: 'F200',
    matchKind: 'exact',
    rangeEndNorm: null,
    wildcard: false,
    display: 'F20.0',
    codePath: null,
    description: 'Paranoid schizophrenia',
    descriptionSource: 'cms',
    count: 0,
    rules: [],
  },
  statesWithList: 2,
  states: [
    { id: 'AL', slug: 'al', name: 'Alabama', hasList: false, cell: { status: 'no_list', ...none } },
    {
      id: 'KY',
      slug: 'ky',
      name: 'Kentucky',
      hasList: true,
      cell: { status: 'not_listed', ...none },
    },
    {
      id: 'LA',
      slug: 'la',
      name: 'Louisiana',
      hasList: true,
      cell: { status: 'not_listed', ...none },
    },
  ],
}

function setup() {
  render(DrillDetails, { props: { detail, takeFocus: false } })
  return screen.getByRole('region', { name: /F20\.0/ })
}

describe('DrillDetails', () => {
  it('gives screen readers each abbreviated state’s full name', () => {
    setup()

    for (const name of ['Alabama', 'Kentucky', 'Louisiana']) {
      const full = screen.getByText(name)
      expect(full.closest('[aria-hidden="true"]')).toBeNull()
    }
    for (const id of ['AL', 'KY', 'LA']) {
      expect(screen.getByText(id).closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('keeps the abbreviations out of the Tab order, with Close details the only stop', () => {
    const panel = setup()

    const stops = panel.querySelectorAll('a, button, input, [tabindex]:not([tabindex="-1"])')
    expect([...stops].map((el) => el.textContent.trim())).toEqual(['Close details'])
  })
})
