<script setup lang="ts">
import {
  CCSR_CITATION,
  codeSystemLabels,
  drillCodeTablePath,
  drillCsvPath,
  type DrillQuery,
  drillQueryFromRecord,
  drillSearchParams,
  drillShowLabels,
  drillShows,
  drillStatusText,
  drillUniverseNote,
  federalCategoryInfo,
  pageTitles,
} from '@mfcd/shared'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import DrillDetails from '../../components/compare/DrillDetails.vue'
import DrillTable from '../../components/compare/DrillTable.vue'
import { ApiError } from '../../lib/api'
import { usePageTitle } from '../../lib/page-title'
import { useDrill, useDrillDetail } from '../../lib/public-drill'

// The category drill-down (roadmap M5 step 6): one unified category's codes, grouped and ranked
// by how many states list them. The URL holds every choice (show, system, all, focus, page,
// code), so a link opens the same view; the Worker renders the same page as HTML.

const route = useRoute('/compare/[categorySlug]')
const router = useRouter()
const slug = computed(() => route.params.categorySlug)
const query = computed(() => drillQueryFromRecord(route.query))

/** Changes the URL; any change but the open code goes back to page 1. */
function update(change: Partial<DrillQuery>) {
  const keepPage = 'code' in change || 'page' in change
  const next: DrillQuery = { ...query.value, ...(keepPage ? {} : { page: 1 }), ...change }
  void router.replace({ query: Object.fromEntries(drillSearchParams(next)) })
}

const drill = useDrill(slug, query)
const data = computed(() => drill.data.value)
const notFound = computed(
  () => drill.error.value instanceof ApiError && drill.error.value.status === 404,
)
const category = computed(() => data.value?.category ?? null)
usePageTitle(() =>
  notFound.value
    ? pageTitles.categoryNotFound
    : category.value
      ? pageTitles.drillDown(category.value.label)
      : null,
)

/** The details opened here take focus; a shared link opening with details does not. */
const takeFocus = ref(false)
const code = computed<string | null>({
  get: () => query.value.code,
  set: (value) => {
    takeFocus.value = value !== null
    update({ code: value })
  },
})
const detail = useDrillDetail(slug, code)

const focus = computed({
  get: () => data.value?.query.focus ?? query.value.focus ?? '',
  set: (value: string) => {
    update({ focus: value === '' ? null : value })
  },
})
const system = computed({
  get: () => data.value?.query.system ?? '',
  set: (value: string) => {
    update({ system: value === '' ? null : (value as DrillQuery['system']) })
  },
})
const includeAll = computed({
  get: () => data.value?.query.all ?? query.value.all,
  set: (value: boolean) => {
    update({ all: value })
  },
})

const caption = computed(() =>
  category.value ? `${category.value.label}: codes by how many states list them` : '',
)
const codeTablePath = computed(() => {
  const d = data.value
  if (!d) return '/compare/codes'
  const ids = d.states.map((s) => s.id)
  const first = d.query.focus
  return drillCodeTablePath(
    d.category.federalCategory,
    first === null ? ids : [first, ...ids.filter((id) => id !== first)],
  )
})
</script>

<template>
  <article class="space-y-6">
    <p><RouterLink to="/compare">Overview of every state</RouterLink></p>

    <template v-if="notFound">
      <h1 class="font-display text-4xl font-medium text-heading">Category not found</h1>
      <p>
        There is no published category at this address.
        <RouterLink to="/compare">See every category</RouterLink>
      </p>
    </template>

    <p v-else-if="drill.error.value" role="alert" class="text-danger">
      The category could not be loaded. Please try again later.
    </p>

    <p v-else-if="!data || !category" class="text-muted-foreground">Loading…</p>

    <template v-else>
      <header class="max-w-prose space-y-3">
        <h1 class="font-display text-4xl font-medium text-heading">{{ category.label }}</h1>
        <p class="text-sm text-muted-foreground">
          Federal category: {{ federalCategoryInfo[category.federalCategory].label }}
        </p>
        <p>{{ category.definition }}</p>
        <p v-if="category.includes">
          <span class="font-semibold">Includes:</span> {{ category.includes }}
        </p>
        <p v-if="category.excludes">
          <span class="font-semibold">Excludes:</span> {{ category.excludes }}
        </p>
        <details v-if="category.ccsr.length > 0" class="text-sm">
          <summary class="cursor-pointer font-semibold">
            CCSR groups ({{ category.ccsr.length }})
          </summary>
          <ul class="mt-2 list-disc space-y-0.5 pl-5">
            <li v-for="g in category.ccsr" :key="g.id">
              <span class="font-mono">{{ g.id }}</span> {{ g.description }}
            </li>
          </ul>
          <p class="mt-2 text-muted-foreground">Source: {{ CCSR_CITATION }}</p>
        </details>
      </header>

      <div class="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div class="flex flex-col gap-1">
          <label for="drill-focus" class="text-sm font-semibold">Focus state</label>
          <select
            id="drill-focus"
            v-model="focus"
            class="rounded border border-input-border bg-background px-2 py-1.5"
          >
            <option value="">None</option>
            <option v-for="s in data.states" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <span id="drill-show-label" class="text-sm font-semibold">Show</span>
          <div
            role="group"
            aria-labelledby="drill-show-label"
            class="inline-flex flex-wrap overflow-hidden rounded border border-input-border"
          >
            <button
              v-for="v in drillShows"
              :key="v"
              type="button"
              class="px-3 py-1.5 text-sm font-semibold"
              :class="
                data.query.show === v
                  ? 'bg-primary text-on-primary'
                  : 'bg-background text-foreground'
              "
              :aria-pressed="data.query.show === v"
              @click="update({ show: v })"
            >
              {{ drillShowLabels[v] }}
            </button>
          </div>
        </div>
        <div v-if="data.systems.length > 1" class="flex flex-col gap-1">
          <label for="drill-system" class="text-sm font-semibold">Code system</label>
          <select
            id="drill-system"
            v-model="system"
            class="rounded border border-input-border bg-background px-2 py-1.5"
          >
            <option value="">All</option>
            <option v-for="sys in data.systems" :key="sys" :value="sys">
              {{ codeSystemLabels[sys] }}
            </option>
          </select>
        </div>
        <div class="flex max-w-xs flex-col gap-1">
          <label class="flex items-center gap-2 text-sm font-semibold">
            <input
              v-model="includeAll"
              type="checkbox"
              :disabled="category.universeSize === 0"
              aria-describedby="drill-universe-note"
            />
            Include codes no state lists
          </label>
          <p id="drill-universe-note" class="text-xs text-muted-foreground">
            {{ drillUniverseNote(category.universeSize) }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-4">
        <p role="status" class="text-sm">{{ drillStatusText(data) }}</p>
        <p class="flex flex-wrap gap-x-4 text-sm">
          <a :href="drillCsvPath(category.slug, query)" download>Download every row (CSV)</a>
          <RouterLink :to="codeTablePath"
            >Compare single codes in
            {{ federalCategoryInfo[category.federalCategory].label }}</RouterLink
          >
        </p>
      </div>

      <div
        class="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]"
        :aria-busy="drill.isFetching.value"
      >
        <div class="min-w-0 space-y-4">
          <p v-if="data.groups.length === 0">No codes match this filter.</p>
          <DrillTable v-else v-model:code="code" :data="data" :caption="caption" />
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
        <aside aria-label="Code details" class="xl:sticky xl:top-4 xl:self-start">
          <DrillDetails
            v-if="code !== null && detail.data.value"
            :detail="detail.data.value"
            :take-focus="takeFocus"
            @close="code = null"
          />
          <p v-else-if="code !== null && detail.error.value" role="alert" class="text-danger">
            The details could not be loaded.
          </p>
          <p v-else class="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Choose “Details” on a code to see which states list it, how, and under which rule.
          </p>
        </aside>
      </div>
    </template>
  </article>
</template>
