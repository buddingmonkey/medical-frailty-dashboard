<script setup lang="ts">
import { draftListResponseSchema, stateListResponseSchema } from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'
import { computed, ref, useId } from 'vue'
import { RouterLink } from 'vue-router'

import { formatTimestampDate } from '../../../lib/admin-watch'
import { getJson } from '../../../lib/api'

// Open drafts per state, to get back to one after leaving "Read and map".
const id = useId()
const statesQuery = useQuery({
  queryKey: ['admin', 'states'],
  queryFn: async () => (await getJson('/api/admin/states', stateListResponseSchema)).items,
  staleTime: Infinity,
})
const stateId = ref('')
const stateName = computed(
  () => statesQuery.data.value?.find((s) => s.id === stateId.value)?.name ?? '',
)
const draftsQuery = useQuery({
  queryKey: computed(() => ['admin', 'drafts', stateId.value]),
  queryFn: async () =>
    (
      await getJson(
        `/api/admin/drafts?${new URLSearchParams({ stateId: stateId.value }).toString()}`,
        draftListResponseSchema,
      )
    ).items,
  enabled: computed(() => stateId.value !== ''),
})
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Drafts</h2>
      <p class="max-w-prose text-muted-foreground">
        A draft holds a state’s new list until it is published, and nothing in it is public. Open a
        draft to read its checks and publish it.
      </p>
    </div>
    <div class="max-w-xs">
      <label :for="`${id}-state`" class="font-medium">State</label>
      <select
        :id="`${id}-state`"
        v-model="stateId"
        class="mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5"
      >
        <option value="" disabled>Choose a state</option>
        <option v-for="s in statesQuery.data.value ?? []" :key="s.id" :value="s.id">
          {{ s.name }}
        </option>
      </select>
    </div>
    <template v-if="stateId && draftsQuery.data.value">
      <p v-if="draftsQuery.data.value.length === 0" class="text-muted-foreground">
        {{ stateName }} has no open drafts. To start one, send rows from
        <RouterLink to="/admin/ingest">Read and map</RouterLink>.
      </p>
      <ul v-else class="space-y-2">
        <li v-for="d in draftsQuery.data.value" :key="d.id">
          <RouterLink :to="`/admin/drafts/${d.id}`" class="font-medium text-link underline"
            >Draft v{{ d.versionNo }}</RouterLink
          >
          <span class="text-muted-foreground">
            · {{ d.rowCount.toLocaleString('en-US') }} entries · started
            {{ formatTimestampDate(d.createdAt) }} by {{ d.createdBy }}</span
          >
        </li>
      </ul>
    </template>
    <p v-if="draftsQuery.error.value" role="alert" class="text-danger">
      The drafts could not be loaded: {{ draftsQuery.error.value.message }}
    </p>
  </section>
</template>
