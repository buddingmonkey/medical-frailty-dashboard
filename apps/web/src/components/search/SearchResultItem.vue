<script setup lang="ts">
import {
  type CodeSearchResult,
  codeSystemLabels,
  SEARCH_PAGE,
  searchListedByText,
  searchTextBy,
} from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// One search result (roadmap M6 step 2): the code and its description, whose text it is when a
// state published it (so CPT text is always attributed), and how many states list the code.

const props = defineProps<{
  result: CodeSearchResult
  /** States with a list on this site; null while they load. */
  listingStates: readonly { slug: string; name: string }[] | null
}>()

const listedBy = computed(() => {
  const names = props.result.listedBy.states.map(
    (slug) => props.listingStates?.find((s) => s.slug === slug)?.name ?? slug.toUpperCase(),
  )
  return searchListedByText(
    props.result.listedBy.count,
    props.listingStates ? props.listingStates.length : null,
    props.listingStates ? names : [],
  )
})
</script>

<template>
  <li class="space-y-1 rounded-lg border border-border px-4 py-3">
    <p class="flex flex-wrap items-baseline gap-x-3">
      <RouterLink
        v-if="result.url"
        :to="result.url"
        class="font-mono text-lg font-semibold text-link"
        >{{ result.code }}</RouterLink
      >
      <span v-else class="font-mono text-lg font-semibold">{{ result.code }}</span>
      <span class="text-sm text-muted-foreground">{{ codeSystemLabels[result.system] }}</span>
    </p>
    <p :class="result.description ? '' : 'text-muted-foreground'">
      {{ result.description ?? SEARCH_PAGE.noDescription }}
    </p>
    <p v-if="result.descriptionSource === 'state' && result.descriptionState" class="text-sm">
      <span class="font-semibold">{{ searchTextBy(result.descriptionState.name) }}</span>
    </p>
    <p class="text-sm text-muted-foreground">{{ listedBy }}</p>
  </li>
</template>
