import type { OverviewOrder, OverviewState, PublicOverviewResponse } from '@mfcd/shared'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import OverviewMatrix from './OverviewMatrix.vue'

// The overview matrix's cells keep their names and links, and share one hover card that says
// what the number means.

beforeAll(() => {
  // jsdom has no top layer or layout (the ui-sdk testing guide's stubs).
  HTMLElement.prototype.showPopover = vi.fn()
  HTMLElement.prototype.hidePopover = vi.fn()
  Element.prototype.getAnimations = () => []
  Element.prototype.checkVisibility = () => true
})

const state = (id: string, name: string, shares: number[]): OverviewState => ({
  id,
  slug: id.toLowerCase(),
  name,
  status: 'published',
  hasList: true,
  cells: shares.map((share, i) => ({
    unifiedId: i + 1,
    entries: share === 0 ? 0 : 6,
    qualifiesAlone: share === 0 ? 0 : 3,
    qualifiesAloneShare: share === 0 ? null : 0.5,
    covered: Math.round(share * 40),
    share,
    reviewed: share !== 0,
  })),
})

const data: PublicOverviewResponse = {
  dataVersion: 1,
  categories: [
    {
      id: 1,
      slug: 'kidney-failure',
      label: 'Kidney failure',
      definition: '',
      federalCategory: 'serious_complex_medical',
      sortOrder: 1,
      coverageBasis: 'universe',
      denominator: 40,
    },
    {
      id: 2,
      slug: 'equipment',
      label: 'Equipment',
      definition: '',
      federalCategory: 'physical_idd_adl',
      sortOrder: 1,
      coverageBasis: 'union',
      denominator: 40,
    },
  ],
  states: [state('GA', 'Georgia', [0.5, 0.25]), state('MT', 'Montana', [1, 0])],
}

async function renderMatrix(): Promise<Router> {
  const stub = defineComponent(() => () => h('p', 'page'))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/compare', component: stub },
      { path: '/compare/:slug', component: stub },
      { path: '/states/:slug', component: stub },
    ],
  })
  await router.push('/compare')
  await router.isReady()
  const order = ref<OverviewOrder>({ by: 'name' })
  render(
    defineComponent(
      () => () =>
        h(OverviewMatrix, {
          data,
          caption: 'Caption',
          order: order.value,
          'onUpdate:order': (o: OverviewOrder) => (order.value = o),
        }),
    ),
    { global: { plugins: [router] } },
  )
  return router
}

const cardContent = () => document.querySelector('[data-slot="hover-card-content"]')

describe('OverviewMatrix cells', () => {
  it('keep their accessible names and links, with no card mounted up front', async () => {
    await renderMatrix()
    const cell = screen.getByRole('link', {
      name: 'Georgia, Kidney failure: 50% of the category’s diagnosis codes',
    })
    expect(cell.getAttribute('href')).toBe('/compare/kidney-failure?focus=GA')
    expect(cell.getAttribute('data-slot')).toBe('hover-card-trigger')
    expect(cell.hasAttribute('aria-describedby')).toBe(false)
    expect(document.querySelectorAll('[data-slot="hover-card-trigger"]')).toHaveLength(4)
    expect(cardContent()).toBeNull()
  })

  it('open one card for the focused cell, with what its number means', async () => {
    const user = userEvent.setup()
    await renderMatrix()
    const cell = screen.getByRole('link', {
      name: 'Georgia, Equipment: 25% of the entries any state lists',
    })
    cell.focus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    await user.tab()
    expect(document.activeElement).toBe(cell)

    const content = await waitFor(() => {
      const el = cardContent()
      if (!el) throw new Error('card not open')
      return el
    })
    const text = content.textContent
    expect(text).toContain('Georgia')
    expect(text).toContain('Equipment')
    expect(text).toContain('25%')
    expect(text).toContain('10 of the 40 distinct entries any state lists here')
    expect(text).toContain('6 entries placed here; 3 are enough by themselves (50%)')
    expect(text).toContain('Every placement here was reviewed')
    expect(text).toContain('Select the number to see the codes')
    expect(document.querySelectorAll('[data-slot="hover-card-content"]')).toHaveLength(1)
    expect(cell.hasAttribute('data-open')).toBe(true)

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(cardContent()).toBeNull()
    })
    expect(document.activeElement).toBe(cell)
  })

  it('still navigate to the drill-down when selected', async () => {
    const user = userEvent.setup()
    const router = await renderMatrix()
    await user.click(
      screen.getByRole('link', {
        name: 'Montana, Kidney failure: 100% of the category’s diagnosis codes',
      }),
    )
    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe('/compare/kidney-failure?focus=MT')
    })
  })
})
