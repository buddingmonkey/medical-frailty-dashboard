import type { MappedRow, ReferenceIndex, ReviewEdits } from '@mfcd/shared'
import { render, screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import ReviewTable from './ReviewTable.vue'

const row = (locator: string, rawCode: string, extra: Partial<MappedRow> = {}): MappedRow => ({
  locator,
  rawCode,
  codeSystemHint: '',
  description: `Description of ${rawCode}`,
  category: 'SMI',
  subcategory: '',
  tier: '',
  qualification: 'standalone',
  qualificationBasis: 'published',
  ...extra,
})

/** Renders the table with its v-models held in a parent, as the ingest page does. */
function setup(
  rows: MappedRow[],
  startEdits: ReviewEdits = {},
  undotted = false,
  reference?: ReferenceIndex,
) {
  const edits = ref<ReviewEdits>(startEdits)
  const undottedIcd = ref(undotted)
  const Harness = defineComponent(
    () => () =>
      h(ReviewTable, {
        rows,
        ...(reference ? { reference } : {}),
        edits: edits.value,
        'onUpdate:edits': (v: ReviewEdits) => {
          edits.value = v
        },
        undottedIcd: undottedIcd.value,
        'onUpdate:undottedIcd': (v: boolean) => {
          undottedIcd.value = v
        },
      }),
  )
  render(Harness)
  return { user: userEvent.setup(), edits }
}

const table = () => screen.getByRole('table', { name: /Rows to review/ })
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const rowFor = (code: string) => {
  const found = bodyRows().find((r) => within(r).queryAllByText(code).length > 0)
  if (!found) throw new Error(`No row for ${code}`)
  return found
}

describe('ReviewTable', () => {
  it('summarizes the rows and shows those that need attention first', () => {
    setup([row('r1', 'F20.0'), row('r2', 'SMI'), row('r3', 'F20')])
    expect(screen.getByText(/3 rows: 1 ready, 1 needs a decision, 1 cannot be read/)).toBeTruthy()
    expect(bodyRows()).toHaveLength(2)
    expect(within(rowFor('SMI')).getByText(/Not a code in any known code system/)).toBeTruthy()
    expect(within(rowFor('F20')).getByText('Whole category or this code only?')).toBeTruthy()
  })

  it('shows every row when asked, and says when nothing needs attention', async () => {
    const { user } = setup([row('r1', 'F20.0')])
    expect(screen.getByText(/No rows need attention/)).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Show'), 'All rows')
    expect(bodyRows()).toHaveLength(1)
  })

  it('answers the category question per row', async () => {
    const { user, edits } = setup([row('r1', 'F20')])
    await user.click(within(rowFor('F20')).getByRole('button', { name: 'Whole category' }))
    expect(edits.value).toEqual({ r1: { includesChildren: 1 } })
    expect(screen.getByText(/1 row: 1 ready/)).toBeTruthy()
  })

  it('sets ICD-10-CM or HCPCS for an ambiguous undotted code', async () => {
    const { user, edits } = setup([row('r1', 'A0103')], {}, true)
    await user.click(within(rowFor('A0103')).getByRole('button', { name: 'ICD-10-CM' }))
    expect(edits.value).toEqual({ r1: { codeSystem: 'icd10cm' } })
  })

  it('re-reads every code when the “written without dots” box changes', async () => {
    const { user } = setup([row('r1', 'A0103')])
    expect(screen.getByText(/1 row: 1 ready/)).toBeTruthy()
    await user.click(screen.getByLabelText(/ICD-10-CM codes are written without dots/))
    expect(screen.getByText(/1 row: 0 ready, 1 needs a decision/)).toBeTruthy()
  })

  it('accepts a flag that needs no choice', async () => {
    const { user, edits } = setup([row('r1', 'M30-M31.*')])
    await user.click(within(rowFor('M30-M31.*')).getByRole('button', { name: 'Accept' }))
    expect(edits.value).toEqual({ r1: { accepted: ['mixed_wildcard_range'] } })
  })

  it('edits a row inline and fixes its problem', async () => {
    const { user, edits } = setup([row('r1', 'L89.500-L89...')])
    await user.click(within(rowFor('L89.500-L89...')).getByRole('button', { name: /Edit/ }))
    const form = screen.getByRole('group', { name: 'Edit row r1' })
    const code = within(form).getByLabelText('Code')
    await user.clear(code)
    await user.type(code, 'L89.500-L89.509')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(edits.value).toEqual({ r1: { rawCode: 'L89.500-L89.509' } })
    expect(screen.getByText(/1 row: 1 ready/)).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Show'), 'Edited')
    expect(within(rowFor('L89.500-L89.509')).getByText('Edited')).toBeTruthy()
  })

  it('cancels an inline edit without changing anything', async () => {
    const { user, edits } = setup([row('r1', 'SMI')])
    await user.click(within(rowFor('SMI')).getByRole('button', { name: /Edit/ }))
    const form = screen.getByRole('group', { name: 'Edit row r1' })
    await user.type(within(form).getByLabelText('Code'), 'X')
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(edits.value).toEqual({})
    expect(screen.queryByRole('group', { name: 'Edit row r1' })).toBeNull()
  })

  it('drops and restores a row', async () => {
    const { user, edits } = setup([row('r1', 'SMI')])
    await user.click(within(rowFor('SMI')).getByRole('button', { name: /Drop/ }))
    expect(edits.value).toEqual({ r1: { dropped: true } })
    expect(
      screen.getByText(/1 row: 0 ready, 0 need a decision, 0 cannot be read, 1 dropped/),
    ).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Show'), 'Dropped')
    await user.click(within(rowFor('SMI')).getByRole('button', { name: /Restore/ }))
    expect(edits.value).toEqual({ r1: { dropped: false } })
  })

  it('sets the code system for every row shown (LA Pharmacy drug classes)', async () => {
    const { user, edits } = setup([
      row('r1', 'H2G', { subcategory: 'Pharmacy' }),
      row('r2', 'H7P', { subcategory: 'Pharmacy' }),
      row('r3', 'F20.0', { subcategory: 'Primary Diagnosis' }),
    ])
    await user.selectOptions(screen.getByLabelText('Show'), 'All rows')
    await user.selectOptions(screen.getByLabelText('Category'), 'SMI / Pharmacy')
    expect(bodyRows()).toHaveLength(2)
    await user.selectOptions(
      screen.getByLabelText('Code system for the 2 rows shown'),
      'Drug class',
    )
    await user.click(screen.getByRole('button', { name: 'Set code system' }))
    expect(edits.value).toEqual({
      r1: { codeSystem: 'drug_class' },
      r2: { codeSystem: 'drug_class' },
    })
  })

  it('answers the category question for every row shown', async () => {
    const { user, edits } = setup([row('r1', 'F20'), row('r2', 'F31'), row('r3', 'F20.0')])
    await user.selectOptions(screen.getByLabelText('Show'), 'All rows')
    await user.click(screen.getByRole('button', { name: 'Whole category for all shown' }))
    expect(edits.value).toEqual({ r1: { includesChildren: 1 }, r2: { includesChildren: 1 } })
  })

  it('finds rows by code or description', async () => {
    const { user } = setup([
      row('r1', 'F20.0'),
      row('r2', 'Z74.09', { description: 'Bed confinement' }),
    ])
    await user.selectOptions(screen.getByLabelText('Show'), 'All rows')
    await user.type(screen.getByLabelText('Search'), 'bed')
    expect(bodyRows()).toHaveLength(1)
    expect(rowFor('Z74.09')).toBeTruthy()
  })

  it('pages long lists', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => row(`r${String(i)}`, `F${String(10 + i)}.0`))
    const { user } = setup(rows)
    await user.selectOptions(screen.getByLabelText('Show'), 'All rows')
    expect(bodyRows()).toHaveLength(50)
    expect(screen.getByText('Rows 1–50 of 120')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Rows 51–100 of 120')).toBeTruthy()
  })

  it('uses the CMS code lists, and shows the codes CMS does not list', async () => {
    const reference: ReferenceIndex = new Map([
      ['A0103', ['icd10cm']],
      ['H2G', []],
    ])
    const { user } = setup([row('r1', 'A0103'), row('r3', 'H2G')], {}, true, reference)
    await user.selectOptions(screen.getByLabelText('Show'), 'Not in the CMS lists')
    expect(bodyRows()).toHaveLength(1)
    expect(within(rowFor('H2G')).getByText('Not in the CMS code list for this system')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Show'), 'All rows')
    expect(within(rowFor('A0103')).getByText('Code system from the CMS code lists')).toBeTruthy()
  })

  it('finds rows by where they came from', async () => {
    const { user } = setup([row('page 29, line 1', 'F20.0'), row('page 295, line 1', 'F31.0')])
    await user.selectOptions(screen.getByLabelText('Show'), 'All rows')
    await user.type(screen.getByLabelText('Search'), 'page 295')
    expect(bodyRows()).toHaveLength(1)
    expect(rowFor('F31.0')).toBeTruthy()
  })
})
