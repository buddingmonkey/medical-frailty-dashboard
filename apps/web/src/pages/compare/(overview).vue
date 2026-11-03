<script setup lang="ts">
import {
  type CoverageBand,
  coverageBandLabels,
  isCodeTableQuery,
  OVERVIEW_NO_LIST,
  type OverviewOrder,
  overviewOrderAnnouncement,
  overviewReadingNotes,
  pageTitles,
} from '@mfcd/shared'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import OverviewMatrix from '../../components/compare/OverviewMatrix.vue'
import { usePageTitle } from '../../lib/page-title'
import { usePublicOverview } from '../../lib/public-overview'

// Which states cover what (roadmap M5 step 5): the overview matrix at /compare. The code table
// that lived here until this step is at /compare/codes; old links redirect (and the Worker
// answers them with a 301).

defineOptions({
  beforeRouteEnter(to) {
    const keys = new URLSearchParams(Object.keys(to.query).map((key) => [key, '']))
    if (!isCodeTableQuery(keys)) return true
    return { path: '/compare/codes', query: to.query, replace: true }
  },
})

usePageTitle(() => pageTitles.overview)

const overview = usePublicOverview()
const data = computed(() => overview.data.value)

const order = ref<OverviewOrder>({ by: 'name' })
const announcement = ref('')
watch(order, (o) => {
  announcement.value = overviewOrderAnnouncement(o, data.value?.categories ?? [])
})

/** The select shows the order; a column sort (from a header) shows as "A column". */
const orderChoice = computed({
  get: () => (order.value.by === 'category' ? 'column' : order.value.by),
  set: (choice: string) => {
    if (choice === 'name' || choice === 'similar') order.value = { by: choice }
    else if (choice === 'overall') order.value = { by: 'overall', dir: 'desc' }
  },
})

const caption = 'Share of each category’s codes that each state lists'

const bands: CoverageBand[] = ['high', 'mid', 'low', 'none']
const swatch: Record<CoverageBand, string> = {
  high: 'bg-cover-high',
  mid: 'bg-cover-mid',
  low: 'bg-cover-low',
  none: 'hatch-none',
}
</script>

<template>
  <article class="space-y-6">
    <header class="max-w-prose space-y-3">
      <h1 class="font-display text-4xl font-medium text-heading">Which states cover what</h1>
      <p>
        Each row is a state; each column is a category, grouped under its federal category in the
        law. A number is the share of the category’s codes that the state lists. Select a number to
        see the category’s codes with that state in focus.
      </p>
    </header>

    <p v-if="overview.error.value" role="alert" class="text-danger">
      The overview could not be loaded. Please try again later.
    </p>
    <p v-else-if="!data" class="text-muted-foreground">Loading…</p>
    <p v-else-if="data.categories.length === 0">No categories are published yet.</p>

    <template v-else>
      <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div class="flex flex-col gap-1">
          <label for="overview-order" class="text-sm font-semibold">Order states by</label>
          <select
            id="overview-order"
            v-model="orderChoice"
            class="rounded border border-input-border bg-background px-2 py-1.5"
          >
            <option value="name">Name</option>
            <option value="overall">Overall coverage</option>
            <option value="similar">Similar states together</option>
            <option v-if="order.by === 'category'" value="column">The column you sorted</option>
          </select>
        </div>
        <ul aria-label="Legend" class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <li v-for="b in bands" :key="b" class="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              class="inline-block h-4 w-6 rounded-sm border border-border"
              :class="swatch[b]"
            ></span
            >{{ coverageBandLabels[b] }}
          </li>
          <li class="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              class="inline-block h-4 w-6 rounded-sm border border-border bg-cover-nolist"
            ></span
            >{{ OVERVIEW_NO_LIST }}
          </li>
        </ul>
        <p
          role="status"
          aria-live="polite"
          class="min-h-5 basis-full text-sm text-muted-foreground"
        >
          {{ announcement }}
        </p>
      </div>

      <OverviewMatrix v-model:order="order" :data="data" :caption="caption" />

      <section aria-labelledby="overview-reading" class="max-w-prose space-y-2 text-sm">
        <h2 id="overview-reading" class="font-display text-xl font-medium text-heading">
          Reading this table
        </h2>
        <p v-for="note in overviewReadingNotes" :key="note">{{ note }}</p>
      </section>
    </template>

    <p>
      <RouterLink to="/compare/codes">Compare single codes in one category</RouterLink>
    </p>
  </article>
</template>
