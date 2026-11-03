<script setup lang="ts">
import {
  isCodeTableQuery,
  type OverviewOrder,
  overviewOrderAnnouncement,
  overviewOrderFromQuery,
  overviewOrderQuery,
  overviewReadingNotes,
  pageTitles,
} from '@mfcd/shared'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import CoverageLegend from '../../components/compare/CoverageLegend.vue'
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

// The order lives in the URL (`?order=`, `?sort=&dir=`), so a shared link keeps it. A change
// made here is announced; a link opened in an order is not.
const route = useRoute()
const router = useRouter()
const categories = computed(() => data.value?.categories ?? [])
const announcement = ref('')
const order = computed<OverviewOrder>({
  get: () => overviewOrderFromQuery(route.query, categories.value),
  set: (o) => {
    announcement.value = overviewOrderAnnouncement(o, categories.value)
    void router.replace({ query: overviewOrderQuery(o, categories.value) })
  },
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
        <CoverageLegend />
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
