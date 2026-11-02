<script setup lang="ts">
import { pageTitles, STATES_AND_DC } from '@mfcd/shared'
import { computed } from 'vue'

import StateTable from '../../components/home/StateTable.vue'
import { usePageTitle } from '../../lib/page-title'
import { usePublicStates } from '../../lib/public-states'

// Every state and DC in one table: the "States" link in the main navigation.

usePageTitle(pageTitles.states)
const { data, isPending, isError } = usePublicStates()
const withList = computed(() => data.value?.items.filter((s) => s.published !== null).length ?? 0)
</script>

<template>
  <section class="space-y-6">
    <header class="max-w-prose space-y-3">
      <h1 class="font-display text-4xl font-medium text-heading">All states</h1>
      <p v-if="data">
        {{ withList }} of {{ STATES_AND_DC }} states and DC have a list on this site. Choose a state
        to see its list, sources and history.
      </p>
    </header>
    <p v-if="isPending" class="text-muted-foreground">Loading…</p>
    <p v-else-if="isError" role="alert" class="text-danger">
      The states could not be loaded. Please try again later.
    </p>
    <StateTable v-else-if="data" :states="data.items" />
  </section>
</template>
