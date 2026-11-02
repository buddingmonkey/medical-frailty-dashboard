<script setup lang="ts">
import {
  stateListResponseSchema,
  type VersionListItem,
  versionListResponseSchema,
} from '@mfcd/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { z } from 'zod'

import { formatTimestampDate } from '../../lib/admin-watch'
import { getJson, sendJson } from '../../lib/api'

// A state's versions, and rollback (docs/data-model.md): an earlier version becomes the public
// list again in one step; its rows never left D1.
const id = useId()
const queryClient = useQueryClient()
const statesQuery = useQuery({
  queryKey: ['admin', 'states'],
  queryFn: async () => (await getJson('/api/admin/states', stateListResponseSchema)).items,
  staleTime: Infinity,
})
const stateId = ref('')
const stateName = computed(
  () => statesQuery.data.value?.find((s) => s.id === stateId.value)?.name ?? '',
)
const versionsQuery = useQuery({
  queryKey: computed(() => ['admin', 'versions', stateId.value]),
  queryFn: async () =>
    (await getJson(`/api/admin/states/${stateId.value}/versions`, versionListResponseSchema)).items,
  enabled: computed(() => stateId.value !== ''),
})

const statusLabels: Record<VersionListItem['status'], string> = {
  draft: 'Draft',
  published: 'Public now',
  superseded: 'Earlier',
  discarded: 'Discarded',
}

const confirming = ref<VersionListItem | null>(null)
const restored = ref<number | null>(null)
watch(stateId, () => {
  confirming.value = null
  restored.value = null
})

const rollback = useMutation({
  mutationFn: (v: VersionListItem) =>
    sendJson(
      'POST',
      `/api/admin/states/${stateId.value}/rollback`,
      { versionId: v.id },
      z.object({ ok: z.literal(true) }),
    ),
  onSuccess: async (_, v) => {
    restored.value = v.versionNo
    confirming.value = null
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  },
})

const n = (value: number) => value.toLocaleString('en-US')
const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Versions</h2>
      <p class="max-w-prose text-muted-foreground">
        Every list a state has had. One is public at a time; an earlier one can be made public again
        in one step.
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

    <p v-if="restored !== null" role="status" class="font-medium">
      v{{ restored }} is public again for {{ stateName }}.
    </p>
    <p v-if="rollback.error.value" role="alert" class="text-danger">
      Could not restore: {{ rollback.error.value.message }}
    </p>

    <template v-if="stateId && versionsQuery.data.value">
      <p v-if="versionsQuery.data.value.length === 0" class="text-muted-foreground">
        No versions for {{ stateName }} yet.
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Versions of
            {{
              stateName
            }}
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">Status</th>
              <th scope="col" class="py-2 pr-4 font-medium">Version</th>
              <th scope="col" class="py-2 pr-4 text-right font-medium">Entries</th>
              <th scope="col" class="py-2 pr-4 font-medium">Started</th>
              <th scope="col" class="py-2 pr-4 font-medium">Published</th>
              <th scope="col" class="py-2 font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in versionsQuery.data.value"
              :key="v.id"
              class="border-b border-border align-top"
            >
              <td class="py-2 pr-4" :class="{ 'font-medium': v.status === 'published' }">
                {{ statusLabels[v.status] }}
              </td>
              <td class="py-2 pr-4">v{{ v.versionNo }}</td>
              <td class="py-2 pr-4 text-right">{{ n(v.rowCount) }}</td>
              <td class="py-2 pr-4">{{ formatTimestampDate(v.createdAt) }} by {{ v.createdBy }}</td>
              <td class="py-2 pr-4">
                <template v-if="v.publishedAt"
                  >{{ formatTimestampDate(v.publishedAt) }} by {{ v.publishedBy }}</template
                >
              </td>
              <td class="py-2">
                <RouterLink
                  v-if="v.status === 'draft'"
                  :to="`/admin/drafts/${v.id}`"
                  class="text-link underline"
                  >Open draft v{{ v.versionNo }}</RouterLink
                >
                <template v-else-if="v.status === 'superseded'">
                  <button
                    v-if="confirming?.id !== v.id"
                    type="button"
                    :class="smallButton"
                    @click="confirming = v"
                  >
                    Restore v{{ v.versionNo }}
                  </button>
                  <span v-else class="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="rounded bg-primary px-3 py-1 text-sm text-on-primary"
                      :disabled="rollback.isPending.value"
                      @click="rollback.mutate(v)"
                    >
                      Yes, make v{{ v.versionNo }} public again
                    </button>
                    <button type="button" :class="smallButton" @click="confirming = null">
                      Cancel
                    </button>
                  </span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
