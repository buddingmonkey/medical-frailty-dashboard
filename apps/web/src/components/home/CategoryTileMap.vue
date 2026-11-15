<script setup lang="ts">
import {
  overviewCategoryGroups,
  type OverviewCellCardPayload,
  OVERVIEW_NOT_REVIEWED,
  type PublicOverviewResponse,
  TILE_MAP_NOT_REVIEWED_NOTE,
  tileMapCaption,
  type TileMapShade,
  tileMapTiles,
} from '@mfcd/shared'
import { createHoverCardController, HoverCardTrigger } from '@ui-sdk/vue/hover-card'
import { computed, useId } from 'vue'
import { RouterLink } from 'vue-router'

import CoverageLegend from '../compare/CoverageLegend.vue'
import OverviewCellCard from '../compare/OverviewCellCard.vue'

// The tile map (roadmap M5 step 8): one published unified category across the country, an
// equal square per state on the US tile grid, with the overview's numbers and shades. The tiles
// are a list in order of state name (what a screen reader reads); CSS grid places each one on
// the map. Every tile says its number in text and its full meaning in its accessible name, and
// the same data is in a table beneath (WCAG 1.3.1, 1.4.1). Each tile with a list opens the
// overview matrix's hover card for its state and the category (project lead, 2026-11-13).

const props = defineProps<{ data: PublicOverviewResponse }>()
/** The category's slug; the page keeps it in the URL. */
const category = defineModel<string>('category', { required: true })

const pickerId = useId()
const groups = computed(() => overviewCategoryGroups(props.data.categories))
const current = computed(
  () => props.data.categories.find((c) => c.slug === category.value) ?? props.data.categories[0],
)
const tiles = computed(() => (current.value ? tileMapTiles(props.data, current.value) : []))

const tileCard = createHoverCardController<OverviewCellCardPayload>()
/** The card's payload for each state with a list, by state id. */
const payloads = computed(() => {
  const out = new Map<string, OverviewCellCardPayload>()
  const category = current.value
  if (!category) return out
  const index = props.data.categories.findIndex((c) => c.id === category.id)
  for (const state of props.data.states) {
    const cell = state.hasList ? state.cells[index] : undefined
    if (cell) out.set(state.id, { stateName: state.name, category, cell })
  }
  return out
})
const caption = computed(() => (current.value ? tileMapCaption(current.value) : ''))
const anyNotReviewed = computed(() => tiles.value.some((t) => t.notReviewed))

// Whole class names, so Tailwind generates them (8 rows, 11 columns).
const rowStart = [
  'row-start-1',
  'row-start-2',
  'row-start-3',
  'row-start-4',
  'row-start-5',
  'row-start-6',
  'row-start-7',
  'row-start-8',
]
const colStart = [
  'col-start-1',
  'col-start-2',
  'col-start-3',
  'col-start-4',
  'col-start-5',
  'col-start-6',
  'col-start-7',
  'col-start-8',
  'col-start-9',
  'col-start-10',
  'col-start-11',
]

const shade: Record<TileMapShade, string> = {
  high: 'bg-cover-high text-on-cover-high',
  mid: 'bg-cover-mid text-on-cover-mid',
  low: 'bg-cover-low text-on-cover-low',
  none: 'hatch-none text-foreground',
  nolist: 'bg-cover-nolist text-muted-foreground',
}

const tileClass =
  'relative flex aspect-square min-w-0 flex-col items-center justify-center rounded-sm ' +
  'text-center leading-none text-[length:clamp(0.5625rem,2.9cqi,1rem)] ' +
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ' +
  'has-[:focus-visible]:outline-ring'
</script>

<template>
  <div v-if="current" class="space-y-4">
    <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div class="flex flex-col gap-1">
        <label :for="pickerId" class="text-sm font-semibold">Category</label>
        <select
          :id="pickerId"
          v-model="category"
          class="max-w-full rounded border border-input-border bg-background px-2 py-1.5"
        >
          <optgroup v-for="g in groups" :key="g.federalCategory" :label="g.label">
            <option v-for="c in g.categories" :key="c.id" :value="c.slug">{{ c.label }}</option>
          </optgroup>
        </select>
      </div>
      <CoverageLegend />
    </div>

    <div role="group" :aria-label="caption" class="@container max-w-3xl">
      <ul class="grid grid-cols-11 gap-0.5 @md:gap-1">
        <li
          v-for="t in tiles"
          :key="t.id"
          :class="[tileClass, shade[t.shade], rowStart[t.row], colStart[t.col]]"
        >
          <span aria-hidden="true" class="font-semibold">{{ t.id }}</span>
          <!-- The number is the link text, so the visible words are in its accessible name
               (WCAG 2.5.3); the link covers the whole tile. -->
          <RouterLink v-if="t.href" v-slot="{ href, navigate }" :to="t.href" custom>
            <HoverCardTrigger
              :controller="tileCard"
              :payload="payloads.get(t.id)"
              :href="href"
              :aria-label="t.label"
              class="mt-[0.2em] font-mono text-current no-underline outline-none after:absolute after:inset-0 hover:underline data-open:underline"
              @click="navigate"
              >{{ t.text }}<span v-if="t.notReviewed" aria-hidden="true">*</span></HoverCardTrigger
            >
          </RouterLink>
          <template v-else>
            <span aria-hidden="true" class="mt-[0.2em] text-[0.85em]">{{ t.text }}</span>
            <span class="sr-only">{{ t.label }}</span>
          </template>
        </li>
      </ul>
    </div>
    <OverviewCellCard :controller="tileCard" />
    <p v-if="anyNotReviewed" class="max-w-prose text-sm text-muted-foreground">
      {{ TILE_MAP_NOT_REVIEWED_NOTE }}
    </p>

    <details class="max-w-3xl">
      <summary class="cursor-pointer font-semibold">Show as a table</summary>
      <table class="mt-3 w-full border-collapse text-sm">
        <caption class="sr-only">
          {{
            caption
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="border-b border-border px-3 py-1.5 text-left">State</th>
            <th scope="col" class="border-b border-border px-3 py-1.5 text-left">
              {{ current.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tiles" :key="t.id">
            <th scope="row" class="border-b border-border px-3 py-1 text-left font-normal">
              <RouterLink :to="`/states/${t.slug}`">{{ t.name }}</RouterLink>
            </th>
            <td class="border-b border-border px-3 py-1">
              <RouterLink v-if="t.href" :to="t.href">{{ t.tableText }}</RouterLink>
              <template v-else>{{ t.tableText }}</template>
              <template v-if="t.notReviewed"> ({{ OVERVIEW_NOT_REVIEWED }})</template>
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>
