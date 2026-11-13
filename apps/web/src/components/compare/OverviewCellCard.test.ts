import type { OverviewCategory, OverviewCell, OverviewCellCardPayload } from '@mfcd/shared'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createHoverCardController, HoverCardTrigger } from '@ui-sdk/vue/hover-card'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import OverviewCellCard from './OverviewCellCard.vue'

// The shared hover card of the overview matrix: one card, its words from the trigger's payload.

beforeAll(() => {
  // jsdom has no top layer or layout (the ui-sdk testing guide's stubs).
  HTMLElement.prototype.showPopover = vi.fn()
  HTMLElement.prototype.hidePopover = vi.fn()
  Element.prototype.getAnimations = () => []
  Element.prototype.checkVisibility = () => true
})

const category: OverviewCategory = {
  id: 3,
  slug: 'kidney-failure',
  label: 'Kidney failure',
  definition: '',
  federalCategory: 'serious_complex_medical',
  sortOrder: 1,
  coverageBasis: 'universe',
  denominator: 200,
}

const cell = (fields: Partial<OverviewCell> = {}): OverviewCell => ({
  unifiedId: 3,
  entries: 4,
  qualifiesAlone: 1,
  qualifiesAloneShare: 0.25,
  covered: 50,
  share: 0.25,
  reviewed: true,
  ...fields,
})

function renderCard(payloads: OverviewCellCardPayload[]) {
  const controller = createHoverCardController<OverviewCellCardPayload>()
  render(
    defineComponent(
      () => () =>
        h('div', [
          ...payloads.map((p) =>
            h(
              HoverCardTrigger,
              { controller, payload: p, href: `#${p.stateName}`, 'aria-label': p.stateName },
              () => '25%',
            ),
          ),
          h(OverviewCellCard, { controller }),
        ]),
    ),
  )
}

describe('OverviewCellCard', () => {
  it('renders nothing until a cell opens it', () => {
    renderCard([{ stateName: 'Georgia', category, cell: cell() }])
    expect(document.querySelector('[data-slot="hover-card-content"]')).toBeNull()
  })

  it('shows the words for the cell whose trigger has focus', async () => {
    const user = userEvent.setup()
    renderCard([
      { stateName: 'Georgia', category, cell: cell() },
      { stateName: 'Montana', category, cell: cell({ reviewed: false }) },
    ])

    await user.tab()
    await user.tab()
    const content = await waitFor(() => {
      const el = document.querySelector('[data-slot="hover-card-content"]')
      if (!el) throw new Error('card not open')
      return el
    })
    expect(content.textContent).toContain('Montana')
    expect(content.textContent).toContain('Kidney failure')
    expect(content.textContent).toContain('Covers 50 of the category’s 200 diagnosis codes')
    expect(content.textContent).toContain('4 entries placed here; 1 is enough by itself (25%)')
    expect(content.textContent).toContain('Not yet reviewed')
    expect(content.textContent).toContain('Select the number to see the codes')
    expect(screen.getByRole('link', { name: 'Montana' }).hasAttribute('data-open')).toBe(true)
    expect(screen.getByRole('link', { name: 'Georgia' }).hasAttribute('data-open')).toBe(false)
    expect(document.querySelectorAll('[data-slot="hover-card-content"]')).toHaveLength(1)
  })
})
