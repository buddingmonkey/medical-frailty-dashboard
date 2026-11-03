<script setup lang="ts">
import {
  compareEmptyText,
  COMPARE_HEADING,
  COMPARE_INTRO,
  COMPARE_INVALID_LINK,
  type CompareQuery,
  compareSearchParams,
  compareSubject,
  downloadTableText,
  formatCount,
  pageTitles,
} from '@mfcd/shared'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CompareTabs from '../../components/compare/CompareTabs.vue'
import CompareControls from '../../components/compare/CompareControls.vue'
import CompareTable from '../../components/compare/CompareTable.vue'
import StatusLegend from '../../components/compare/StatusLegend.vue'
import { ApiError } from '../../lib/api'
import { usePageTitle } from '../../lib/page-title'
import {
  type CompareSelection,
  emptySelection,
  queryFromRoute,
  queryFromSelection,
  selectionFromQuery,
  selectionKey,
  useCompare,
} from '../../lib/public-compare'
import { usePublicStates } from '../../lib/public-states'

// Compare single codes (roadmap M4 step 2). The URL holds the whole selection, so a link shows
// the same table to anyone; the controls write to it as soon as the selection is complete.

usePageTitle(() => pageTitles.compare)

const route = useRoute()
const router = useRouter()
const states = usePublicStates()

/** The table shown: what the URL says. */
const active = computed<CompareQuery | null>(() => queryFromRoute(route.query))
const selection = ref<CompareSelection>(
  active.value ? selectionFromQuery(active.value) : emptySelection(),
)

// URL → controls (a shared link, the back button), unless they already agree.
watch(active, (q) => {
  if (!q) return
  const current = queryFromSelection(selection.value)
  if (!current || selectionKey(current) !== selectionKey(q)) selection.value = selectionFromQuery(q)
})

// Controls → URL, back to page 1. An incomplete selection leaves the URL alone.
watch(
  selection,
  (s) => {
    const q = queryFromSelection(s)
    if (!q) return
    if (active.value && selectionKey(active.value) === selectionKey(q)) return
    void router.replace({ query: Object.fromEntries(compareSearchParams(q)) })
  },
  { deep: true },
)

function goToPage(page: number) {
  if (!active.value) return
  void router.replace({
    query: Object.fromEntries(compareSearchParams({ ...active.value, page })),
  })
}

const result = useCompare(active)
const data = computed(() => (active.value ? result.data.value : undefined))
const errorText = computed(() => {
  const e = result.error.value
  if (!e) return null
  return e instanceof ApiError && e.status === 400
    ? COMPARE_INVALID_LINK
    : 'The comparison could not be loaded. Please try again later.'
})

const caption = computed(() => {
  const q = active.value
  const d = data.value
  if (!q || !d) return ''
  const names = new Map(d.states.map((s) => [s.id, s.name]))
  return `${compareSubject(q, (id) => names.get(id) ?? id)}: codes by state`
})

const csvHref = computed(() => {
  if (!active.value) return null
  return `/compare/codes.csv?${compareSearchParams({ ...active.value, page: 1 }).toString()}`
})
</script>

<template>
  <article class="space-y-8">
    <header class="space-y-3">
      <h1 class="font-display text-4xl font-medium text-heading">{{ COMPARE_HEADING }}</h1>
      <CompareTabs />
      <p class="max-w-prose">{{ COMPARE_INTRO }}</p>
    </header>

    <CompareControls v-model="selection" :states="states.data.value?.items ?? []" />

    <p v-if="!active" class="text-muted-foreground">
      Pick a category and at least one state to see the table.
    </p>

    <p v-else-if="errorText" role="alert" class="text-danger">{{ errorText }}</p>

    <p v-else-if="!data" class="text-muted-foreground">Loading…</p>

    <section v-else class="space-y-4" :aria-busy="result.isFetching.value">
      <h2 class="font-display text-2xl font-medium text-heading">{{ caption }}</h2>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <p role="status">
          {{ formatCount(data.totalRows) }} codes, page {{ data.page }} of {{ data.pageCount }}
        </p>
        <a v-if="csvHref && data.totalRows > 0" :href="csvHref" class="text-link" download>
          {{ downloadTableText(data.totalRows) }}
        </a>
      </div>

      <p v-if="data.totalRows === 0">{{ compareEmptyText(active.alone) }}</p>
      <CompareTable v-else :data="data" :query="active" :caption="caption" />

      <nav v-if="data.pageCount > 1" aria-label="Pages" class="flex items-center gap-3">
        <button
          type="button"
          class="rounded border border-input-border px-3 py-1.5 disabled:opacity-50"
          :disabled="data.page <= 1"
          @click="goToPage(data.page - 1)"
        >
          Previous page
        </button>
        <button
          type="button"
          class="rounded border border-input-border px-3 py-1.5 disabled:opacity-50"
          :disabled="data.page >= data.pageCount"
          @click="goToPage(data.page + 1)"
        >
          Next page
        </button>
      </nav>

      <StatusLegend />
    </section>
  </article>
</template>
