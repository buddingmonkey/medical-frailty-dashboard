<script setup lang="ts">
import {
  formatCount,
  pageTitles,
  parseStatesPair,
  similarityText,
  SIMILARITY_NOTE,
  statesCompareAllLabel,
  statesCompareCaption,
  statesCompareCsvPath,
  statesCompareNames,
  statesCompareNoListText,
  statesCompareOnlyLabel,
  statesComparePath,
  type StatesCompareQuery,
  statesCompareQueryFromRecord,
  statesCompareSearchParams,
  STATES_COMPARE_INTRO,
  STATES_COMPARE_SUMMARY_NOTE,
  statesCompareSummaryText,
  statesCompareTitle,
} from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import StatesCompareTable from '../../../components/compare/StatesCompareTable.vue'
import StatesPicker from '../../../components/compare/StatesPicker.vue'
import { ApiError } from '../../../lib/api'
import { usePageTitle } from '../../../lib/page-title'
import { useStatesCompare } from '../../../lib/public-states-compare'

// Compare 2–4 states (roadmap M5 step 7): `/compare/states/ga-vs-mt`. The path holds the states
// in column order; the query holds "Show only differences" (`diff=0` turns it off) and the page.
// The Worker renders the same page as HTML.

const route = useRoute('/compare/states/[pair]')
const router = useRouter()
const ids = computed(() => parseStatesPair(route.params.pair))
const query = computed(() => statesCompareQueryFromRecord(route.query))

function update(change: Partial<StatesCompareQuery>) {
  const next: StatesCompareQuery = { ...query.value, page: 1, ...change }
  void router.replace({ query: Object.fromEntries(statesCompareSearchParams(next)) })
}

const compare = useStatesCompare(ids, query)
const data = computed(() => compare.data.value)
const notFound = computed(
  () =>
    ids.value === null ||
    (compare.error.value instanceof ApiError && compare.error.value.status === 404),
)
const names = computed(() => data.value?.states.map((s) => s.name) ?? [])
usePageTitle(() =>
  notFound.value
    ? pageTitles.statesCompareNotFound
    : data.value
      ? statesCompareTitle(names.value)
      : null,
)

const noList = computed(() => data.value?.states.filter((s) => !s.hasList) ?? [])
const showOnlyDifferences = computed({
  get: () => data.value?.query.diff ?? query.value.diff,
  set: (value: boolean) => {
    update({ diff: value })
  },
})

function open(next: string[]) {
  void router.push(statesComparePath(next, { diff: query.value.diff }))
}
</script>

<template>
  <article class="space-y-6">
    <p><RouterLink to="/compare">Overview of every state</RouterLink></p>

    <template v-if="notFound">
      <h1 class="font-display text-4xl font-medium text-heading">Comparison not found</h1>
      <p class="max-w-prose">
        A comparison names 2 to 4 states with a list, like
        <RouterLink to="/compare/states/ga-vs-ne">/compare/states/ga-vs-ne</RouterLink>.
        <RouterLink to="/states">See all states</RouterLink>
      </p>
    </template>

    <p v-else-if="compare.error.value" role="alert" class="text-danger">
      The comparison could not be loaded. Please try again later.
    </p>

    <p v-else-if="!data" class="text-muted-foreground">Loading…</p>

    <template v-else>
      <header class="max-w-prose space-y-3">
        <h1 class="font-display text-4xl font-medium text-heading">
          {{ statesCompareNames(names) }}
        </h1>
        <p>{{ STATES_COMPARE_INTRO }}</p>
      </header>

      <StatesPicker
        :choices="data.choices"
        :current="data.states.map((s) => s.id)"
        @compare="open"
      />

      <p v-if="noList.length > 0" role="status" class="max-w-prose text-lg">
        {{ statesCompareNoListText(noList.map((s) => s.name)) }}
        <template v-for="s in noList" :key="s.id">
          <RouterLink :to="`/states/${s.slug}`">{{ s.name }}’s page</RouterLink>.
        </template>
      </p>

      <template v-else-if="data.summary">
        <section aria-labelledby="compare-summary-heading" class="space-y-2">
          <h2 id="compare-summary-heading" class="sr-only">Summary</h2>
          <dl class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
            <div
              v-for="(s, i) in data.states"
              :key="s.id"
              class="rounded-lg border border-border bg-surface p-3"
            >
              <dt class="text-sm text-muted-foreground">{{ statesCompareOnlyLabel(s.name) }}</dt>
              <dd class="text-2xl font-semibold tabular-nums">
                {{ formatCount(data.summary.only[i] ?? 0) }}
              </dd>
            </div>
            <div class="rounded-lg border border-border bg-surface p-3">
              <dt class="text-sm text-muted-foreground">
                {{ statesCompareAllLabel(data.states.length) }}
              </dt>
              <dd class="text-2xl font-semibold tabular-nums">
                {{ formatCount(data.summary.all) }}
              </dd>
            </div>
            <div
              v-if="data.summary.similarity"
              class="rounded-lg border border-border bg-surface p-3"
            >
              <dt class="text-sm text-muted-foreground">Similarity</dt>
              <dd class="text-2xl font-semibold tabular-nums">
                {{ similarityText(data.summary.similarity.jaccard) }}
              </dd>
            </div>
          </dl>
          <p class="max-w-prose text-sm text-muted-foreground">
            {{ STATES_COMPARE_SUMMARY_NOTE }}
            <template v-if="data.summary.similarity">{{ SIMILARITY_NOTE }}</template>
          </p>
        </section>

        <div class="flex flex-wrap items-center justify-between gap-4">
          <label class="flex items-center gap-2 font-semibold">
            <input v-model="showOnlyDifferences" type="checkbox" />
            Show only differences
          </label>
          <p class="flex flex-wrap gap-x-4 text-sm">
            <a :href="statesCompareCsvPath(data.states.map((s) => s.id))" download
              >Download every code (CSV)</a
            >
          </p>
        </div>

        <p role="status" class="text-sm">
          {{
            statesCompareSummaryText({
              totalRows: data.totalRows,
              totalGroups: data.totalGroups,
              page: data.page,
              pageCount: data.pageCount,
              diff: data.query.diff,
            })
          }}
        </p>

        <div class="space-y-4" :aria-busy="compare.isFetching.value">
          <StatesCompareTable
            :data="data"
            :caption="statesCompareCaption(names, data.query.diff)"
          />
          <nav v-if="data.pageCount > 1" aria-label="Pages" class="flex items-center gap-3">
            <button
              type="button"
              class="rounded border border-input-border px-3 py-1.5 disabled:opacity-50"
              :disabled="data.page <= 1"
              @click="update({ page: data.page - 1 })"
            >
              Previous page
            </button>
            <button
              type="button"
              class="rounded border border-input-border px-3 py-1.5 disabled:opacity-50"
              :disabled="data.page >= data.pageCount"
              @click="update({ page: data.page + 1 })"
            >
              Next page
            </button>
          </nav>
        </div>
      </template>
    </template>
  </article>
</template>
