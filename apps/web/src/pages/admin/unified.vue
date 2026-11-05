<script setup lang="ts">
import {
  ccsrCategoryListResponseSchema,
  coverageRebuildProgressText,
  type CoverageRebuildRequest,
  type CoverageRebuildResponse,
  coverageRebuildResponseSchema,
  type CoverageRebuildStep,
  coverageRebuildStepLabels,
  coverageRebuildStepSchema,
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
import { ApiError, getJson, sendJson } from '../../lib/api'

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
// ICD-10-CM release. Each unit writes only what changed. The API does a bounded amount of work
// per call (about 0.5 s of D1 time, src/routes/admin/coverage.ts) and answers with progress and
// a cursor; this calls again until it is done.
//
// D1 limits load over a 10-second window ("Too many resources consumed within a 10 second
// window", preview 2026-11-05), so the page pauses between calls: at most about 0.5 s of D1 work
// per 2 s or so, well under the load that failed. 54 calls on preview (19 categories, 51 states,
// 44 states' pairs), so the pauses add about 80 s. When D1 still answers busy (`retryable`), the
// page waits longer each time and sends the same cursor again, which is safe because a unit
// writes only what is still missing; after the last retry it shows the error.
/** Pause between two calls. */
const CALL_PAUSE_MS = 1500
/** Waits before each retry of a call that found the database busy. */
const RETRY_WAITS_MS = [5000, 10_000, 20_000]
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
/** True while a busy call waits to be retried. */
const waitingToRetry = ref(false)

/** One call, retried after a wait while the database is busy. */
async function rebuildCall(body: CoverageRebuildRequest): Promise<CoverageRebuildResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await sendJson(
        'POST',
        '/api/admin/coverage/rebuild',
        body,
        coverageRebuildResponseSchema,
      )
    } catch (err) {
      const wait = RETRY_WAITS_MS[attempt]
      if (!(err instanceof ApiError && err.retryable) || wait === undefined) throw err
      waitingToRetry.value = true
      await sleep(wait)
    } finally {
      waitingToRetry.value = false
    }
  }
}

const progress = ref<CoverageRebuildResponse['progress'] | null>(null)
/** The step the call in flight works on: the next one once a step's units are all done. */
const currentStep = computed<CoverageRebuildStep>(() => {
  const p = progress.value
  if (!p) return 'universe'
  if (p.completed < p.total) return p.step
  const steps = coverageRebuildStepSchema.options
  return steps[steps.indexOf(p.step) + 1] ?? p.step
})
const rebuild = useMutation({
  mutationFn: async () => {
    progress.value = null
    let body: CoverageRebuildRequest = {}
    let ms = 0
    for (;;) {
      // `body` changes only after a call succeeds, so a retry resends the last good cursor.
      const r = await rebuildCall(body)
      ms += r.ms
      progress.value = r.progress
      if (r.done || !r.next) return { ...r, ms }
      body = { cursor: r.next }
      await sleep(CALL_PAUSE_MS)
    }
  },
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
        Shared categories that sit between the federal categories and each state’s own, so states
        can be compared. Each one has a definition and the CCSR groups whose ICD-10-CM codes belong
        to it. Only published unified categories appear on public pages. Map each state’s categories
        to them in Mappings.
      </p>
    </div>

    <p v-if="saved" role="status" class="font-medium">{{ saved }}</p>
    <p v-if="saved && save.data.value?.warning" role="alert" class="text-danger">
      {{ save.data.value.warning }}
    </p>
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
        Recalculates every unified category’s full code list, which unified categories each state’s
        codes fall in, and how alike the states’ lists are. Saving a unified category or a mapping,
        and publishing a list, already does this for what changed. Use it after a new CCSR or
        ICD-10-CM release, after test data is loaded, or when a save says coverage could not be
        updated.
      </p>
      <button
        type="button"
        :class="smallButton"
        :disabled="rebuild.isPending.value"
        @click="rebuild.mutate()"
      >
        {{ rebuild.isPending.value ? 'Rebuilding…' : 'Rebuild coverage' }}
      </button>
      <p class="max-w-prose text-muted-foreground">
        It runs in three steps (full code lists, placements, state similarity) and shows its
        progress. Keep the page open; it can take a few minutes. When the database has too much to
        do, the page waits and tries again. If it stops, press the button again: it changes only
        what is still out of date.
      </p>
      <p v-if="rebuild.isPending.value && progress" role="status">
        {{ coverageRebuildProgressText(progress) }}
      </p>
      <p v-if="rebuild.isPending.value && waitingToRetry" role="status">
        The database is busy. Waiting, then trying again…
      </p>
      <p v-if="rebuilt" role="status">{{ rebuilt }}</p>
      <p v-if="rebuild.error.value" role="alert" class="text-danger">
        Could not rebuild ({{ coverageRebuildStepLabels[currentStep] }}):
        {{ rebuild.error.value.message }}
      </p>
    </section>
  </section>
</template>
