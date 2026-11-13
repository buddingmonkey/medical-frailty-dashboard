import type { OverviewState, PublicOverviewResponse } from '@mfcd/shared'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import CategoryTileMap from './CategoryTileMap.vue'

// The Map tab's tiles open the overview matrix's hover card (project lead, 2026-11-13): the
// same card, for the state and the category on the map.

beforeAll(() => {
  // jsdom has no top layer or layout (the ui-sdk testing guide's stubs).
  HTMLElement.prototype.showPopover = vi.fn()
  HTMLElement.prototype.hidePopover = vi.fn()
  Element.prototype.getAnimations = () => []
  Element.prototype.checkVisibility = () => true
})

const state = (id: string, name: string, share: number): OverviewState => ({
  id,
  slug: id.toLowerCase(),
  name,
  status: 'published',
  hasList: true,
  cells: [
    {
      unifiedId: 1,
      entries: 6,
      qualifiesAlone: 3,
      qualifiesAloneShare: 0.5,
      covered: Math.round(share * 40),
      share,
      reviewed: true,
    },
  ],
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
  ],
  states: [state('GA', 'Georgia', 0.5), state('MT', 'Montana', 1)],
}

async function renderMap() {
  const stub = defineComponent(() => () => h('p', 'page'))
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/compare/map', component: stub },
      { path: '/compare/:slug', component: stub },
      { path: '/states/:slug', component: stub },
    ],
  })
  await router.push('/compare/map')
  await router.isReady()
  const category = ref('kidney-failure')
  render(
    defineComponent(
      () => () =>
        h(CategoryTileMap, {
          data,
          category: category.value,
          'onUpdate:category': (c: string) => (category.value = c),
        }),
    ),
    { global: { plugins: [router] } },
  )
}

const cardContent = () => document.querySelector('[data-slot="hover-card-content"]')

describe('CategoryTileMap tiles', () => {
  it('keep their names and links, and only states with a list get a card', async () => {
    await renderMap()
    const tile = screen.getByRole('link', {
      name: 'Georgia, Kidney failure: 50% of the category’s diagnosis codes',
    })
    expect(tile.getAttribute('href')).toBe('/compare/kidney-failure?focus=GA')
    expect(tile.getAttribute('data-slot')).toBe('hover-card-trigger')
    expect(document.querySelectorAll('[data-slot="hover-card-trigger"]')).toHaveLength(2)
    expect(cardContent()).toBeNull()
  })

  it('open the card for the focused tile', async () => {
    const user = userEvent.setup()
    await renderMap()
    const tile = screen.getByRole('link', { name: /^Georgia, Kidney failure/ })
    while (document.activeElement !== tile) await user.tab()

    const content = await waitFor(() => {
      const el = cardContent()
      if (!el) throw new Error('card not open')
      return el
    })
    expect(content.textContent).toContain('Georgia')
    expect(content.textContent).toContain('Kidney failure')
    expect(content.textContent).toContain('Covers 20 of the category’s 40 diagnosis codes')
    expect(content.textContent).toContain('Select the number to see the codes')
  })
})
