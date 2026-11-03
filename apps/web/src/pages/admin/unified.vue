<script setup lang="ts">
import {
  ccsrCategoryListResponseSchema,
  coverageRebuildResponseSchema,
  federalCategories,
  federalCategoryInfo,
  type UnifiedCategoryBody,
  unifiedListResponseSchema,
  type UnifiedListItem,
  unifiedSaveResponseSchema,
} from '@mfcd/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, ref, useTemplateRef } from 'vue'

import UnifiedCategoryForm from '../../components/admin/UnifiedCategoryForm.vue'
import { unifiedStatusClasses, unifiedStatusLabels } from '../../lib/admin-unified'
import { getJson, sendJson } from '../../lib/api'

// Unified categories (roadmap M5 step 3; docs/data-model.md, "Unified categories (M5)"):
// admin-curated groups between the federal categories and each state's own.
const queryClient = useQueryClient()
const list = useQuery({
  queryKey: ['admin', 'unified'],
  queryFn: async () => (await getJson('/api/admin/unified', unifiedListResponseSchema)).items,
})
const ccsr = useQuery({
  queryKey: ['admin', 'ccsr-categories'],
  queryFn: async () =>
    (await getJson('/api/admin/ccsr-categories', ccsrCategoryListResponseSchema)).items,
  staleTime: Infinity,
})

const byParent = computed(() =>
  federalCategories
    .filter((f) => f !== 'unmapped')
    .map((f) => ({
      federalCategory: f,
      label: federalCategoryInfo[f].label,
      items: (list.data.value ?? []).filter((u) => u.federalCategory === f),
    }))
    .filter((g) => g.items.length > 0),
)

/** null: no form open; 'new': the create form; else the category being edited. */
const editing = ref<UnifiedListItem | 'new' | null>(null)
const formRegion = useTemplateRef<HTMLElement>('formRegion')
const saved = ref<string | null>(null)

async function openForm(target: UnifiedListItem | 'new') {
  editing.value = target
  saved.value = null
  save.reset()
  await nextTick()
  formRegion.value?.querySelector('input')?.focus()
}

const save = useMutation({
  mutationFn: (body: UnifiedCategoryBody) => {
    const current = editing.value
    return current === 'new' || current === null
      ? sendJson('POST', '/api/admin/unified', body, unifiedSaveResponseSchema)
      : sendJson('PUT', `/api/admin/unified/${String(current.id)}`, body, unifiedSaveResponseSchema)
  },
  onSuccess: async (result, body) => {
    saved.value = `Saved ${body.label} (version ${String(result.version)}).`
    editing.value = null
    await queryClient.invalidateQueries({ queryKey: ['admin', 'unified'] })
  },
})

// Rebuild coverage (docs/deployment.md, "Preview data"): after seed data, or a new CCSR or
// ICD-10-CM release. Each step writes only what changed.
const rebuild = useMutation({
  mutationFn: () =>
    sendJson('POST', '/api/admin/coverage/rebuild', {}, coverageRebuildResponseSchema),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'unified'] })
  },
})
const n = (value: number) => value.toLocaleString('en-US')
const rebuilt = computed(() => {
  const r = rebuild.data.value
  if (!r) return null
  return `Rebuilt ${n(r.categories)} categories: ${n(r.universeCodes)} codes in their full lists, ${n(r.placements)} placements, ${n(r.similarPairs)} state pairs (${(r.ms / 1000).toFixed(1)} s).`
})

const groupCount = (u: UnifiedListItem) =>
  `${String(u.ccsr.length)} ${u.ccsr.length === 1 ? 'group' : 'groups'}`
const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Unified categories</h2>
      <p class="max-w-prose text-muted-foreground">
        Groups that sit between the federal categories and each state’s own, so many states can be
        compared. Each one has a definition and the CCSR groups whose ICD-10-CM codes belong to it.
        Only published categories appear on public pages.
      </p>
    </div>

    <p v-if="saved" role="status" class="font-medium">{{ saved }}</p>
    <p v-if="list.error.value" role="alert" class="text-danger">
      Could not load the unified categories: {{ list.error.value.message }}
    </p>
    <p v-if="ccsr.error.value" role="alert" class="text-danger">
      Could not load the CCSR groups: {{ ccsr.error.value.message }}
    </p>

    <div v-if="editing === null">
      <button type="button" :class="smallButton" @click="openForm('new')">
        New unified category
      </button>
    </div>
    <div v-else ref="formRegion">
      <UnifiedCategoryForm
        :key="editing === 'new' ? 'new' : editing.id"
        :item="editing === 'new' ? undefined : editing"
        :ccsr-options="ccsr.data.value ?? []"
        :saving="save.isPending.value"
        :server-error="save.error.value?.message ?? null"
        @save="save.mutate($event)"
        @cancel="editing = null"
      />
    </div>

    <p v-if="list.data.value && list.data.value.length === 0" class="text-muted-foreground">
      No unified categories yet.
    </p>
    <div v-for="group in byParent" :key="group.federalCategory" class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="pb-2 text-left font-display text-lg font-medium text-heading">
          {{
            group.label
          }}
        </caption>
        <thead class="border-b border-border text-muted-foreground">
          <tr>
            <th scope="col" class="py-2 pr-4 font-medium">Unified category</th>
            <th scope="col" class="py-2 pr-4 font-medium">Status</th>
            <th scope="col" class="py-2 pr-4 font-medium">Version</th>
            <th scope="col" class="py-2 pr-4 font-medium">CCSR groups</th>
            <th scope="col" class="py-2 pr-4 text-right font-medium">Approved mappings</th>
            <th scope="col" class="py-2 font-medium"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in group.items" :key="u.id" class="border-b border-border align-top">
            <th scope="row" class="py-2 pr-4 font-medium">
              {{ u.label }}
              <span class="block font-mono text-xs font-normal text-muted-foreground">{{
                u.slug
              }}</span>
            </th>
            <td class="py-2 pr-4">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="unifiedStatusClasses[u.status]"
                >{{ unifiedStatusLabels[u.status] }}</span
              >
            </td>
            <td class="py-2 pr-4">v{{ u.version }}</td>
            <td class="py-2 pr-4">
              <span :title="u.ccsrGroups.map((g) => g.ccsrCategory).join(', ')">{{
                groupCount(u)
              }}</span>
            </td>
            <td class="py-2 pr-4 text-right">{{ u.approvedMappings }}</td>
            <td class="py-2">
              <button
                type="button"
                :class="smallButton"
                :aria-label="`Edit ${u.label}`"
                @click="openForm(u)"
              >
                Edit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <section aria-labelledby="rebuild-heading" class="space-y-2 border-t border-border pt-6">
      <h3 id="rebuild-heading" class="font-display text-lg font-medium text-heading">
        Rebuild coverage
      </h3>
      <p class="max-w-prose text-muted-foreground">
        Rebuilds every category’s full code list, where each state’s codes count, and how alike the
        states are. Saving categories and mappings already does this. Use it after loading seed data
        or a new CCSR or ICD-10-CM release. It changes only what is out of date.
      </p>
      <button
        type="button"
        :class="smallButton"
        :disabled="rebuild.isPending.value"
        @click="rebuild.mutate()"
      >
        {{ rebuild.isPending.value ? 'Rebuilding…' : 'Rebuild coverage' }}
      </button>
      <p v-if="rebuilt" role="status">{{ rebuilt }}</p>
      <p v-if="rebuild.error.value" role="alert" class="text-danger">
        Could not rebuild: {{ rebuild.error.value.message }}
      </p>
    </section>
  </section>
</template>
