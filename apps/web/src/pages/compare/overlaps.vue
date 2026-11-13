<script setup lang="ts">
import {
  OVERLAPS_DESCRIPTION,
  OVERLAPS_EMPTY,
  OVERLAPS_HEADING,
  OVERLAPS_INTRO,
  overlapsPageTitle,
  overviewCategoryGroups,
  tileMapCategory,
  tileMapQuery,
} from '@mfcd/shared'
import { computed, useId } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CompareTabs from '../../components/compare/CompareTabs.vue'
import OverlapTable from '../../components/compare/OverlapTable.vue'
import { usePageMeta } from '../../lib/page-meta'
import { useOverlaps } from '../../lib/public-overlaps'
import { usePublicOverview } from '../../lib/public-overview'

// The Overlaps tab (project lead, 2026-11-12): which groups of states list exactly the same
// codes in one category. The category lives in the URL (`?category=<slug>`) and is picked like
// the Map tab's; the Worker renders the same table as HTML.

usePageMeta({ title: overlapsPageTitle, description: OVERLAPS_DESCRIPTION })

const overview = usePublicOverview()
const categories = computed(() => overview.data.value?.categories ?? [])
const route = useRoute()
const router = useRouter()
const pickerId = useId()
const groups = computed(() => overviewCategoryGroups(categories.value))
const category = computed<string>({
  get: () => tileMapCategory(categories.value, route.query)?.slug ?? '',
  set: (slug) => {
    void router.replace({ query: tileMapQuery(categories.value, slug) })
  },
})
const overlaps = useOverlaps(category)
const data = computed(() => overlaps.data.value)
</script>

<template>
  <article class="space-y-6">
    <header class="space-y-3">
      <h1 class="font-display text-4xl font-medium text-heading">{{ OVERLAPS_HEADING }}</h1>
      <CompareTabs />
      <p class="max-w-prose">{{ OVERLAPS_INTRO }}</p>
    </header>

    <p v-if="overview.error.value || overlaps.error.value" role="alert" class="text-danger">
      The overlaps could not be loaded. Please try again later.
    </p>
    <p v-else-if="!overview.data.value" class="text-muted-foreground">Loading…</p>
    <p v-else-if="categories.length === 0">No categories are published yet.</p>
    <template v-else>
      <div class="flex flex-col gap-1">
        <label :for="pickerId" class="text-sm font-semibold">Category</label>
        <select
          :id="pickerId"
          v-model="category"
          class="max-w-full self-start rounded border border-input-border bg-background px-2 py-1.5"
        >
          <optgroup v-for="g in groups" :key="g.federalCategory" :label="g.label">
            <option v-for="c in g.categories" :key="c.id" :value="c.slug">{{ c.label }}</option>
          </optgroup>
        </select>
      </div>
      <p v-if="!data" class="text-muted-foreground">Loading…</p>
      <p v-else-if="data.intersections.length === 0">{{ OVERLAPS_EMPTY }}</p>
      <OverlapTable v-else :data="data" />
    </template>
  </article>
</template>
