<script setup lang="ts">
import {
  type StateUnifiedCategory,
  stateListResponseSchema,
  stateUnifiedMappingsResponseSchema,
  type UnifiedMapping,
  type UnifiedMappingPut,
  unifiedListResponseSchema,
  unifiedMappingSaveResponseSchema,
} from '@mfcd/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'

import MappingForm from '../../components/admin/MappingForm.vue'
import { percent, relationLabels, stateCategoryName } from '../../lib/admin-unified'
import { formatTimestampDate } from '../../lib/admin-watch'
import { getJson, sendJson } from '../../lib/api'

// Mapping each state category to unified categories (roadmap M5 step 3; docs/data-model.md,
// "Unified categories (M5)"). Rows are never deleted: a save supersedes the current ones.
// One admin may approve (project lead, 2026-11-02).
const id = useId()
const queryClient = useQueryClient()
const statesQuery = useQuery({
  queryKey: ['admin', 'states'],
  queryFn: async () => (await getJson('/api/admin/states', stateListResponseSchema)).items,
  staleTime: Infinity,
})
const publishedStates = computed(() =>
  (statesQuery.data.value ?? []).filter((s) => s.status === 'published'),
)
const unifiedQuery = useQuery({
  queryKey: ['admin', 'unified'],
  queryFn: async () => (await getJson('/api/admin/unified', unifiedListResponseSchema)).items,
})
const labelOf = computed(
  () => new Map((unifiedQuery.data.value ?? []).map((u) => [u.id, u.label] as const)),
)

const stateId = ref('')
const stateName = computed(
  () => statesQuery.data.value?.find((s) => s.id === stateId.value)?.name ?? '',
)
const queryKey = computed(() => ['admin', 'unified-mappings', stateId.value])
const query = useQuery({
  queryKey,
  queryFn: () =>
    getJson(
      `/api/admin/states/${stateId.value}/unified-mappings`,
      stateUnifiedMappingsResponseSchema,
    ),
  enabled: computed(() => stateId.value !== ''),
})
const categories = computed(() => query.data.value?.categories ?? [])

const keyOf = (c: { stateCategory: string; stateSubcategory: string }) =>
  `${c.stateCategory}\u0000${c.stateSubcategory}`
const editingKey = ref<string | null>(null)
const editing = computed(() => categories.value.find((c) => keyOf(c) === editingKey.value))
const formRegion = useTemplateRef<HTMLElement>('formRegion')
const saved = ref<string | null>(null)

watch(stateId, () => {
  editingKey.value = null
  saved.value = null
})

async function edit(c: StateUnifiedCategory) {
  editingKey.value = keyOf(c)
  saved.value = null
  save.reset()
  await nextTick()
  formRegion.value?.querySelector('input')?.focus()
}

function targetText(m: UnifiedMapping): string {
  if (m.relation === 'by_code' || m.unifiedId === null) return 'Place each code by its CCSR group'
  return `${relationLabels[m.relation]}: ${labelOf.value.get(m.unifiedId) ?? `#${String(m.unifiedId)}`}`
}
const approvedOf = (c: StateUnifiedCategory) => c.mappings.filter((m) => m.status === 'approved')
const proposedOf = (c: StateUnifiedCategory) => c.mappings.filter((m) => m.status === 'proposed')
function reviewText(rows: UnifiedMapping[]): string {
  const r = rows[0]
  if (!r?.reviewedBy || !r.reviewedAt) return 'Reviewed by one admin'
  return `Reviewed by one admin (${r.reviewedBy}, ${formatTimestampDate(r.reviewedAt)})`
}
function suggestionText(c: StateUnifiedCategory): string {
  if (c.icdEntries === 0) return 'No ICD-10-CM entries'
  const best = c.suggestion.unified[0]
  const groups = c.suggestion.ccsr
    .slice(0, 3)
    .map((g) => `${g.ccsrCategory} ×${String(g.count)}`)
    .join(', ')
  return best ? `${best.label} ${percent(best.share)}; ${groups}` : groups || 'No CCSR groups found'
}

const ok = unifiedMappingSaveResponseSchema
const save = useMutation({
  mutationFn: (body: UnifiedMappingPut) =>
    sendJson('PUT', `/api/admin/states/${stateId.value}/unified-mappings`, body, ok),
  onSuccess: async (result, body) => {
    saved.value = `${stateCategoryName(body)}: ${result.review}.`
    editingKey.value = null
    await refresh()
  },
})
const approve = useMutation({
  mutationFn: (c: StateUnifiedCategory) =>
    sendJson(
      'POST',
      `/api/admin/states/${stateId.value}/unified-mappings/approve`,
      { stateCategory: c.stateCategory, stateSubcategory: c.stateSubcategory },
      ok,
    ),
  onSuccess: async (result, c) => {
    saved.value = `${stateCategoryName(c)}: ${result.review}.`
    await refresh()
  },
})
async function refresh() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKey.value }),
    queryClient.invalidateQueries({ queryKey: ['admin', 'unified'] }),
  ])
}

const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Mappings</h2>
      <p class="max-w-prose text-muted-foreground">
        Map each category of a state’s published list to one or more unified categories. The
        suggestion comes from the CCSR groups of the category’s ICD-10-CM codes. Changes are kept: a
        new mapping replaces the old one, which stays in the history.
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
        <option v-for="s in publishedStates" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <p
        v-if="statesQuery.data.value && publishedStates.length === 0"
        class="mt-1 text-sm text-muted-foreground"
      >
        No state has a published list yet.
      </p>
    </div>

    <p v-if="saved" role="status" class="font-medium">{{ saved }}</p>
    <p v-if="approve.error.value" role="alert" class="text-danger">
      Could not approve: {{ approve.error.value.message }}
    </p>
    <p v-if="query.error.value" role="alert" class="text-danger">
      Could not load the mappings: {{ query.error.value.message }}
    </p>

    <template v-if="stateId && query.data.value">
      <p v-if="categories.length === 0" class="text-muted-foreground">
        {{ stateName }} has no published entries.
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Categories of
            {{
              stateName
            }}
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">State category</th>
              <th scope="col" class="py-2 pr-4 text-right font-medium">Entries</th>
              <th scope="col" class="py-2 pr-4 font-medium">Mapping</th>
              <th scope="col" class="py-2 pr-4 font-medium">Suggestion</th>
              <th scope="col" class="py-2 font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in categories" :key="keyOf(c)" class="border-b border-border align-top">
              <th scope="row" class="py-2 pr-4 font-medium">{{ stateCategoryName(c) }}</th>
              <td class="py-2 pr-4 text-right">
                {{ c.entries }}
                <span class="block text-xs text-muted-foreground"
                  >{{ c.icdEntries }} ICD-10-CM</span
                >
              </td>
              <td class="py-2 pr-4">
                <template v-if="approvedOf(c).length > 0">
                  <span v-for="m in approvedOf(c)" :key="m.id" class="block">{{
                    targetText(m)
                  }}</span>
                  <span class="block text-xs text-muted-foreground">{{
                    reviewText(approvedOf(c))
                  }}</span>
                </template>
                <template v-if="proposedOf(c).length > 0">
                  <span v-for="m in proposedOf(c)" :key="m.id" class="block italic"
                    >Proposed: {{ targetText(m) }}</span
                  >
                </template>
                <span v-if="c.mappings.length === 0" class="text-muted-foreground">Not mapped</span>
              </td>
              <td class="py-2 pr-4">{{ suggestionText(c) }}</td>
              <td class="py-2">
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    :class="smallButton"
                    :aria-label="`Edit ${stateCategoryName(c)}`"
                    @click="edit(c)"
                  >
                    Edit
                  </button>
                  <button
                    v-if="proposedOf(c).length > 0"
                    type="button"
                    :class="smallButton"
                    :disabled="approve.isPending.value"
                    :aria-label="`Approve the proposal for ${stateCategoryName(c)}`"
                    @click="approve.mutate(c)"
                  >
                    Approve
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="editing" ref="formRegion">
        <MappingForm
          :key="editingKey ?? ''"
          :category="editing"
          :unified="unifiedQuery.data.value ?? []"
          :saving="save.isPending.value"
          :server-error="save.error.value?.message ?? null"
          @save="save.mutate($event)"
          @cancel="editingKey = null"
        />
      </div>
    </template>
  </section>
</template>
