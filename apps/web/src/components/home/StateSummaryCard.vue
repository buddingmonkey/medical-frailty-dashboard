<script setup lang="ts">
import {
  type CodeSystem,
  codeSystemLabels,
  type FederalCategory,
  FEDERAL_OVERLAP_NOTE,
  federalCategoryInfo,
  federalCountsOverlap,
  type PublicStateSummary,
  formatCount,
  formatDay,
  stateStatusLabels,
} from '@mfcd/shared'
import { computed, useId } from 'vue'
import { RouterLink } from 'vue-router'

// The hover/focus card next to the map: one state's counts by code system and federal category.

const props = defineProps<{ state: PublicStateSummary }>()

const headingId = useId()

const bySystem = computed(() => {
  const p = props.state.published
  if (!p) return []
  return (Object.entries(p.bySystem) as [CodeSystem, number][])
    .filter(([, n]) => n > 0)
    .map(([system, n]) => ({ label: codeSystemLabels[system], n }))
})

const byCategory = computed(() => {
  const p = props.state.published
  if (!p) return []
  return (Object.entries(p.byFederalCategory) as [FederalCategory, number][])
    .filter(([, n]) => n > 0)
    .map(([category, n]) => ({ label: federalCategoryInfo[category].label, n }))
})
</script>

<template>
  <section
    :aria-labelledby="headingId"
    aria-live="polite"
    class="space-y-3 rounded-lg border border-border bg-surface p-4"
  >
    <h2 :id="headingId" class="font-display text-2xl font-medium text-heading">
      {{ state.name }}
    </h2>
    <p class="text-sm text-muted-foreground">{{ stateStatusLabels[state.status] }}</p>

    <template v-if="state.published">
      <p class="text-lg">
        <span class="font-semibold tabular-nums">{{
          formatCount(state.published.totalEntries)
        }}</span>
        entries
      </p>
      <p v-if="state.published.sourceDate" class="text-sm">
        State list dated {{ formatDay(state.published.sourceDate) }}
      </p>

      <div>
        <h3 class="text-sm font-semibold text-heading">By code system</h3>
        <dl class="mt-1 space-y-0.5 text-sm">
          <div v-for="row in bySystem" :key="row.label" class="flex justify-between gap-4">
            <dt>{{ row.label }}</dt>
            <dd class="tabular-nums">{{ formatCount(row.n) }}</dd>
          </div>
        </dl>
      </div>

      <div>
        <h3 class="text-sm font-semibold text-heading">By federal category</h3>
        <dl class="mt-1 space-y-0.5 text-sm">
          <div v-for="row in byCategory" :key="row.label" class="flex justify-between gap-4">
            <dt>{{ row.label }}</dt>
            <dd class="tabular-nums">{{ formatCount(row.n) }}</dd>
          </div>
        </dl>
        <p v-if="federalCountsOverlap(state.published)" class="mt-2 text-sm text-muted-foreground">
          {{ FEDERAL_OVERLAP_NOTE }}
        </p>
        <p v-if="!state.published.mappingsConfirmed" class="mt-2 text-sm text-muted-foreground">
          Our team has not yet confirmed how this state’s categories fit the federal ones.
        </p>
      </div>
    </template>

    <RouterLink :to="`/states/${state.slug}`" class="inline-block font-semibold text-link">
      {{ state.published ? `See ${state.name}’s list` : `About ${state.name}` }}
    </RouterLink>
  </section>
</template>
