<script setup lang="ts">
import {
  type CodeSystem,
  SEARCH_DEBOUNCE_MS,
  SEARCH_PAGE,
  searchCountText,
  searchEmptyText,
  type SearchPageQuery,
  searchPageParams,
  searchPageQuery,
  searchReady,
} from '@mfcd/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SearchFilters from '../components/search/SearchFilters.vue'
import SearchResultItem from '../components/search/SearchResultItem.vue'
import { useCodeSearch } from '../composables/useCodeSearch'
import { ApiError } from '../lib/api'
import { usePageMeta } from '../lib/page-meta'
import { usePublicStates } from '../lib/public-states'

// Code search (roadmap M6 step 2). The URL holds the search (`?q=&states=&system=`), so a link
// shows the same results and Back works. Typing writes the URL with `replace` after a pause;
// a filter change writes it at once with `push`. The results follow the URL.

usePageMeta({ title: SEARCH_PAGE.title, description: SEARCH_PAGE.intro })

// Search result pages are not for search engines (docs/seo.md). The SPA fallback serves this
// page, so the tag is added here.
let robots: HTMLMetaElement | null = null
onMounted(() => {
  robots = document.createElement('meta')
  robots.name = 'robots'
  robots.content = 'noindex'
  document.head.append(robots)
})
onBeforeUnmount(() => robots?.remove())

const route = useRoute()
const router = useRouter()

/** The search the URL holds. */
const active = computed<SearchPageQuery>(() => searchPageQuery(route.query))

const text = ref(active.value.q)
const system = ref<CodeSystem | null>(active.value.system)
const states = ref<string[]>([...active.value.states])

// URL → controls (a shared link, Back), unless they already agree.
watch(active, (q) => {
  if (text.value.trim() !== q.q) text.value = q.q
  if (system.value !== q.system) system.value = q.system
  if (states.value.join(',') !== q.states.join(',')) states.value = [...q.states]
})

function write(mode: 'push' | 'replace') {
  const next = searchPageParams({ q: text.value, states: states.value, system: system.value })
  const current = searchPageParams(active.value)
  if (JSON.stringify(next) === JSON.stringify(current)) return
  void (mode === 'push' ? router.push({ query: next }) : router.replace({ query: next }))
}

let timer: ReturnType<typeof setTimeout> | undefined
function commitNow(mode: 'push' | 'replace') {
  clearTimeout(timer)
  write(mode)
}
watch(text, () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    write('replace')
  }, SEARCH_DEBOUNCE_MS)
})
watch([system, () => states.value.join(',')], () => {
  commitNow('push')
})
onBeforeUnmount(() => {
  clearTimeout(timer)
})

const listing = usePublicStates()
/** States with a list on this site, by name: the filter's choices and the "of N" count. */
const listingStates = computed(() => {
  const items = listing.data.value?.items
  if (!items) return null
  return items.filter((s) => s.published !== null).map((s) => ({ slug: s.slug, name: s.name }))
})

const ready = computed(() => searchReady(active.value.q))
const search = useCodeSearch(() => (ready.value ? active.value : null))

/** Results for the search in the URL; not the previous search's while the next one loads. */
const current = computed(() =>
  ready.value && !search.isPlaceholderData.value ? (search.data.value ?? null) : null,
)
/** What the list shows: the previous search's results stay, marked busy, until the next arrive. */
const shown = computed(() => (ready.value ? (search.data.value ?? null) : null))
const loading = computed(() => ready.value && current.value === null && !search.error.value)
const filtered = computed(() => active.value.states.length > 0 || active.value.system !== null)

const errorText = computed(() => {
  const e = search.error.value
  if (!ready.value || !e) return null
  return e instanceof ApiError && e.status === 400 ? SEARCH_PAGE.badFilter : SEARCH_PAGE.error
})

/** What the live region says: set once the results for a search arrive (WCAG 4.1.3). */
const announcement = computed(() => {
  const data = current.value
  if (!data) return ''
  return data.results.length === 0
    ? searchEmptyText(active.value.q, filtered.value)
    : searchCountText(data.results.length, data.query.limit)
})
</script>

<template>
  <div class="space-y-6">
    <header class="max-w-prose space-y-2">
      <h1 class="font-display text-4xl font-medium text-heading">{{ SEARCH_PAGE.heading }}</h1>
      <p>{{ SEARCH_PAGE.intro }}</p>
    </header>

    <form role="search" class="space-y-4" @submit.prevent="commitNow('replace')">
      <div class="flex max-w-xl flex-col gap-1">
        <label for="search-q" class="font-semibold">{{ SEARCH_PAGE.inputLabel }}</label>
        <input
          id="search-q"
          v-model="text"
          type="search"
          autocomplete="off"
          spellcheck="false"
          maxlength="100"
          class="rounded border border-input-border bg-background px-3 py-2 text-lg"
        />
      </div>
      <SearchFilters v-model:system="system" v-model:states="states" :choices="listingStates" />
    </form>

    <div class="space-y-4">
      <p role="status" aria-live="polite" aria-atomic="true" class="font-semibold">
        {{ announcement }}
      </p>
      <p v-if="!ready" class="text-muted-foreground">{{ SEARCH_PAGE.idle }}</p>
      <p v-else-if="errorText" role="alert" class="text-danger">{{ errorText }}</p>
      <p v-else-if="loading" class="text-muted-foreground">{{ SEARCH_PAGE.loading }}</p>
      <ol
        v-if="shown && shown.results.length > 0 && !errorText"
        :aria-label="SEARCH_PAGE.resultsLabel"
        :aria-busy="loading"
        class="space-y-3"
        :class="loading ? 'opacity-60' : ''"
      >
        <SearchResultItem
          v-for="r in shown.results"
          :key="`${r.system}:${r.codeNorm}`"
          :result="r"
          :listing-states="listingStates"
        />
      </ol>
    </div>
  </div>
</template>
