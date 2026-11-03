<script setup lang="ts">
import {
  CATEGORIES_HEADING,
  CATEGORIES_INTRO,
  CCSR_LINK_TEXT,
  CCSR_URL,
  federalCategoryClauseText,
  overviewCategoryGroups,
  pageTitles,
  STATUTE_LINK_TEXT,
  STATUTE_URL,
} from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import CompareTabs from '../../components/compare/CompareTabs.vue'
import { usePageTitle } from '../../lib/page-title'
import { usePublicOverview } from '../../lib/public-overview'

// The Categories tab (project lead, 2026-11-02): every published unified category under its
// federal category, each linking to its page (`/compare/<slug>`). The overview's data, which
// is cached on data_version, lists them. The Worker renders the same page as HTML.

usePageTitle(pageTitles.categories)

const overview = usePublicOverview()
const groups = computed(() => overviewCategoryGroups(overview.data.value?.categories ?? []))
</script>

<template>
  <article class="space-y-6">
    <header class="space-y-3">
      <h1 class="font-display text-4xl font-medium text-heading">{{ CATEGORIES_HEADING }}</h1>
      <CompareTabs />
      <p class="max-w-prose">{{ CATEGORIES_INTRO }}</p>
      <p class="flex flex-wrap gap-x-4 text-sm">
        <a :href="CCSR_URL" rel="noopener noreferrer external" class="text-link">{{
          CCSR_LINK_TEXT
        }}</a>
        <a :href="STATUTE_URL" rel="noopener noreferrer external" class="text-link">{{
          STATUTE_LINK_TEXT
        }}</a>
      </p>
    </header>

    <p v-if="overview.error.value" role="alert" class="text-danger">
      The categories could not be loaded. Please try again later.
    </p>
    <p v-else-if="!overview.data.value" class="text-muted-foreground">Loading…</p>
    <p v-else-if="groups.length === 0">No categories are published yet.</p>

    <template v-else>
      <section
        v-for="g in groups"
        :key="g.federalCategory"
        :aria-labelledby="`federal-${g.federalCategory}`"
        class="max-w-prose space-y-3"
      >
        <h2
          :id="`federal-${g.federalCategory}`"
          class="font-display text-2xl font-medium text-heading"
        >
          {{ g.label }}
        </h2>
        <p
          v-if="federalCategoryClauseText(g.federalCategory)"
          class="text-sm text-muted-foreground"
        >
          {{ federalCategoryClauseText(g.federalCategory) }}
        </p>
        <ul class="divide-y divide-border border-y border-border">
          <li v-for="c in g.categories" :key="c.id" class="space-y-1 py-3">
            <RouterLink :to="`/compare/${c.slug}`" class="font-semibold">{{ c.label }}</RouterLink>
            <p v-if="c.definition" class="text-sm text-muted-foreground">{{ c.definition }}</p>
          </li>
        </ul>
      </section>
    </template>
  </article>
</template>
