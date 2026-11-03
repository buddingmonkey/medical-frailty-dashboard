<script setup lang="ts">
import {
  pageTitles,
  STATES_AND_DC,
  TILE_MAP_HEADING,
  TILE_MAP_INTRO,
  tileMapCategory,
  tileMapQuery,
} from '@mfcd/shared'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CategoryTileMap from '../components/home/CategoryTileMap.vue'
import StateMap from '../components/home/StateMap.vue'
import StateSummaryCard from '../components/home/StateSummaryCard.vue'
import StateTable from '../components/home/StateTable.vue'
import { usePageTitle } from '../lib/page-title'
import { usePublicOverview } from '../lib/public-overview'
import { usePublicStates } from '../lib/public-states'

usePageTitle(pageTitles.home)
const { data, isPending, isError } = usePublicStates()

const view = ref<'map' | 'table'>('map')
onMounted(() => {
  // Small screens start on the table; the map's shapes are too small to tap there.
  if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches) {
    view.value = 'table'
  }
})

const states = computed(() => data.value?.items ?? [])
const withList = computed(() => states.value.filter((s) => s.published !== null).length)

const activeId = ref<string | null>(null)
const activeState = computed(
  () =>
    states.value.find((s) => s.id === activeId.value) ??
    // Before any hover, show the first state with a list.
    states.value.find((s) => s.published !== null) ??
    null,
)

// One category across the country (roadmap M5 step 8): the overview's data (cached on
// data_version), one category at a time; the category lives in the URL (`?category=<slug>`).
const overview = usePublicOverview()
const route = useRoute()
const router = useRouter()
const tileCategory = computed<string>({
  get: () => tileMapCategory(overview.data.value?.categories ?? [], route.query)?.slug ?? '',
  set: (slug) => {
    const query = { ...route.query }
    delete query['category']
    void router.replace({
      query: { ...query, ...tileMapQuery(overview.data.value?.categories ?? [], slug) },
    })
  },
})

const legend = [
  { key: 'published', label: 'List on this site' },
  { key: 'announced', label: 'List announced, not on this site yet' },
  { key: 'none', label: 'No list yet' },
] as const
</script>

<template>
  <div class="space-y-8">
    <section class="max-w-prose space-y-4">
      <h1 class="font-display text-4xl font-medium text-balance text-heading">
        Compare medical frailty codes by state
      </h1>
      <p class="text-lg text-foreground">
        Under H.R.1, Medicaid members who are medically frail are exempt from work requirements.
        Each state publishes its own list of diagnosis and service codes for frailty. This site puts
        those lists side by side.
      </p>
    </section>

    <section aria-labelledby="states-heading" class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="states-heading" class="font-display text-2xl font-medium text-heading">States</h2>
          <p v-if="data" class="text-muted-foreground">
            {{ withList }} of {{ STATES_AND_DC }} states and DC have a list on this site.
          </p>
        </div>
        <div
          class="inline-flex rounded-md border border-input-border"
          role="group"
          aria-label="View"
        >
          <button
            v-for="option in ['map', 'table'] as const"
            :key="option"
            type="button"
            :aria-pressed="view === option"
            class="px-4 py-1.5 text-sm font-semibold first:rounded-l-md last:rounded-r-md"
            :class="view === option ? 'bg-primary text-on-primary' : 'text-foreground'"
            @click="view = option"
          >
            {{ option === 'map' ? 'Map' : 'Table' }}
          </button>
        </div>
      </div>

      <p v-if="isPending" class="text-muted-foreground">Loading states…</p>
      <p v-else-if="isError" role="alert" class="text-danger">
        The state list could not be loaded. Please try again later.
      </p>

      <template v-else-if="data">
        <div v-if="view === 'map'" class="grid gap-6 lg:grid-cols-3">
          <div class="space-y-3 lg:col-span-2">
            <StateMap v-model:active="activeId" :states="states" />
            <ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Map key">
              <li v-for="item in legend" :key="item.key" class="flex items-center gap-2">
                <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true">
                  <pattern
                    id="legend-hatch"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" class="fill-map-none" />
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="6"
                      class="stroke-map-announced"
                      stroke-width="3"
                    />
                  </pattern>
                  <rect
                    width="15"
                    height="15"
                    x="0.5"
                    y="0.5"
                    class="stroke-map-border"
                    :class="
                      item.key === 'published'
                        ? 'fill-map-published'
                        : item.key === 'none'
                          ? 'fill-map-none'
                          : ''
                    "
                    :fill="item.key === 'announced' ? 'url(#legend-hatch)' : undefined"
                  />
                </svg>
                {{ item.label }}
              </li>
            </ul>
          </div>
          <StateSummaryCard v-if="activeState" :state="activeState" />
        </div>
        <StateTable v-else :states="states" />
      </template>
    </section>

    <section
      v-if="overview.data.value && overview.data.value.categories.length > 0"
      aria-labelledby="tiles-heading"
      class="space-y-4"
    >
      <div class="max-w-prose space-y-1">
        <h2 id="tiles-heading" class="font-display text-2xl font-medium text-heading">
          {{ TILE_MAP_HEADING }}
        </h2>
        <p class="text-muted-foreground">{{ TILE_MAP_INTRO }}</p>
      </div>
      <CategoryTileMap v-model:category="tileCategory" :data="overview.data.value" />
    </section>
  </div>
</template>
