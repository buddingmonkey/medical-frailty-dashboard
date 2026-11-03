<script setup lang="ts">
import {
  pageTitles,
  TILE_MAP_HEADING,
  TILE_MAP_INTRO,
  tileMapCategory,
  tileMapQuery,
} from '@mfcd/shared'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CategoryTileMap from '../../components/home/CategoryTileMap.vue'
import CompareTabs from '../../components/compare/CompareTabs.vue'
import { usePageTitle } from '../../lib/page-title'
import { usePublicOverview } from '../../lib/public-overview'

// The Map tab (project lead, 2026-11-02): the tile map, one category across the country. It was
// on the home page too until 2026-11-03; old `/?category=` links redirect here. The category
// lives in the URL (`?category=<slug>`); the Worker renders the same page as HTML.

usePageTitle(pageTitles.map)

const overview = usePublicOverview()
const data = computed(() => overview.data.value)
const route = useRoute()
const router = useRouter()
const category = computed<string>({
  get: () => tileMapCategory(data.value?.categories ?? [], route.query)?.slug ?? '',
  set: (slug) => {
    void router.replace({ query: tileMapQuery(data.value?.categories ?? [], slug) })
  },
})
</script>

<template>
  <article class="space-y-6">
    <header class="space-y-3">
      <h1 class="font-display text-4xl font-medium text-heading">{{ TILE_MAP_HEADING }}</h1>
      <CompareTabs />
      <p class="max-w-prose">{{ TILE_MAP_INTRO }}</p>
    </header>

    <p v-if="overview.error.value" role="alert" class="text-danger">
      The map could not be loaded. Please try again later.
    </p>
    <p v-else-if="!data" class="text-muted-foreground">Loading…</p>
    <p v-else-if="data.categories.length === 0">No categories are published yet.</p>
    <CategoryTileMap v-else v-model:category="category" :data="data" />
  </article>
</template>
