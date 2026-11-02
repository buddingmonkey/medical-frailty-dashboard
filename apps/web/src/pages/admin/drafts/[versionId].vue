<script setup lang="ts">
import {
  type CheckLevel,
  type CheckReport,
  codeSystemLabels,
  codeSystems,
  draftChecksResponseSchema,
  draftDetailSchema,
  stateListResponseSchema,
} from '@mfcd/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { z } from 'zod'

import PublishPanel from '../../../components/admin/PublishPanel.vue'
import { formatTimestampDate } from '../../../lib/admin-watch'
import { ApiError, getJson, sendJson } from '../../../lib/api'
import { diffToCsv } from '../../../lib/diff-csv'

// One draft version: its sources, the checks report and the diff against the published
// version (docs/ingestion.md, step 7). Publishing comes in M2 step 8.
const route = useRoute('/admin/drafts/[versionId]')
const versionId = computed(() => route.params.versionId)
const id = useId()
const queryClient = useQueryClient()

const statesQuery = useQuery({
  queryKey: ['admin', 'states'],
  queryFn: async () => (await getJson('/api/admin/states', stateListResponseSchema)).items,
  staleTime: Infinity,
})
const draftQuery = useQuery({
  queryKey: computed(() => ['admin', 'draft', versionId.value]),
  queryFn: () => getJson(`/api/admin/drafts/${versionId.value}`, draftDetailSchema),
})
const draft = computed(() => draftQuery.data.value)
const stateName = computed(
  () => statesQuery.data.value?.find((s) => s.id === draft.value?.stateId)?.name ?? '',
)
const notFound = computed(
  () => draftQuery.error.value instanceof ApiError && draftQuery.error.value.status === 404,
)

const checksQuery = useQuery({
  queryKey: computed(() => ['admin', 'draft', versionId.value, 'checks']),
  queryFn: () => getJson(`/api/admin/drafts/${versionId.value}/checks`, draftChecksResponseSchema),
  enabled: computed(() => draft.value !== undefined),
})
const report = computed(() => checksQuery.data.value?.report)

// --- Checks -----------------------------------------------------------------------------------
const levels: { level: CheckLevel; label: string }[] = [
  { level: 'block', label: 'Blocks publishing' },
  { level: 'confirm_typed', label: 'Needs the state code typed' },
  { level: 'confirm', label: 'Needs a confirmation' },
  { level: 'info', label: 'For information' },
]
const fired = computed(() =>
  levels
    .map(({ level, label }) => ({
      level,
      label,
      checks: report.value?.checks.filter((c) => c.triggered && c.level === level) ?? [],
    }))
    .filter((group) => group.checks.length > 0),
)
const passed = computed(() => report.value?.checks.filter((c) => !c.triggered) ?? [])

// --- Diff -------------------------------------------------------------------------------------
type Kind = CheckReport['diff']['changes'][number]['kind'] | 'all'
const kindLabels: Record<Kind, string> = {
  all: 'All changes',
  added: 'Added',
  removed: 'Removed',
  description_changed: 'Description changed',
  category_changed: 'Category changed',
}
const kind = ref<Kind>('all')
const page = ref(0)
const PAGE_SIZE = 50
const changes = computed(() =>
  (report.value?.diff.changes ?? []).filter((c) => kind.value === 'all' || c.kind === kind.value),
)
const pageChanges = computed(() =>
  changes.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE),
)
watch(kind, () => {
  page.value = 0
})
const systems = computed(() =>
  codeSystems.flatMap((system) => {
    const counts = report.value?.diff.bySystem[system]
    return counts ? [{ label: codeSystemLabels[system], counts }] : []
  }),
)

function downloadCsv() {
  const r = report.value
  const d = draft.value
  if (!r || !d) return
  const blob = new Blob([diffToCsv(r.diff.changes)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${d.stateId.toLowerCase()}-draft-v${String(d.versionNo)}-diff.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// --- Discard ----------------------------------------------------------------------------------
const confirming = ref(false)
const discard = useMutation({
  mutationFn: () =>
    sendJson(
      'POST',
      `/api/admin/drafts/${versionId.value}/discard`,
      {},
      z.object({ ok: z.literal(true) }),
    ),
  onSuccess: async () => {
    confirming.value = false
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  },
})

const n = (value: number) => value.toLocaleString('en-US')
const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
</script>

<template>
  <section class="space-y-8">
    <p v-if="notFound" role="alert">No draft with this number.</p>
    <p v-else-if="draftQuery.error.value" role="alert" class="text-danger">
      Could not load the draft: {{ draftQuery.error.value.message }}
    </p>

    <template v-if="draft">
      <div class="space-y-1">
        <h2 class="font-display text-2xl font-medium text-heading">
          {{ stateName || draft.stateId }}: draft v{{ draft.versionNo }}
        </h2>
        <p class="text-muted-foreground">
          {{ n(draft.rowCount) }} entries · started {{ formatTimestampDate(draft.createdAt) }} by
          {{ draft.createdBy }}
        </p>
        <p v-if="draft.status === 'discarded'" role="status" class="font-medium">
          This draft was discarded. It is kept for the record and can no longer change.
        </p>
        <p v-else-if="draft.status === 'published'" role="status" class="font-medium">
          This is {{ stateName || draft.stateId }}’s public list. It can no longer change; an
          earlier list can be restored from
          <RouterLink to="/admin/versions" class="text-link underline">Versions</RouterLink>.
        </p>
        <p v-else-if="draft.status !== 'draft'" role="status" class="font-medium">
          This version is {{ draft.status }}; it can no longer change. See
          <RouterLink to="/admin/versions" class="text-link underline">Versions</RouterLink>.
        </p>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="mb-2 text-left font-display text-lg font-medium text-heading">
            Source files in this draft
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">File</th>
              <th scope="col" class="py-2 pr-4 font-medium">Table</th>
              <th scope="col" class="py-2 pr-4 font-medium">Entries stored</th>
              <th scope="col" class="py-2 pr-4 font-medium">Rows that cannot be read</th>
              <th scope="col" class="py-2 font-medium">States named in the file</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in draft.parts"
              :key="`${s.sourceDocumentId}|${s.part}`"
              class="border-b border-border"
            >
              <th scope="row" class="py-2 pr-4 font-medium">{{ s.title }}</th>
              <td class="py-2 pr-4">{{ s.part }}</td>
              <td
                class="py-2 pr-4"
                :class="{ 'font-medium text-danger': s.storedEntries !== s.expectedEntries }"
              >
                {{ n(s.storedEntries) }} of {{ n(s.expectedEntries) }}
              </td>
              <td class="py-2 pr-4">{{ n(s.invalidRowCount) }}</td>
              <td class="py-2">{{ s.namedStateIds.join(', ') || 'none' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="draft.parts.length === 0" class="text-muted-foreground">
          No files yet. Send rows from “Read and map”.
        </p>
      </div>

      <section class="space-y-3" :aria-labelledby="`${id}-checks`">
        <div class="flex flex-wrap items-baseline gap-3">
          <h3 :id="`${id}-checks`" class="font-display text-xl font-medium text-heading">Checks</h3>
          <button
            type="button"
            :class="smallButton"
            :disabled="checksQuery.isFetching.value"
            @click="checksQuery.refetch()"
          >
            Run the checks again
          </button>
          <span v-if="checksQuery.data.value" class="text-sm text-muted-foreground">
            Last run {{ new Date(checksQuery.data.value.ranAt).toLocaleString('en-US') }}
          </span>
        </div>
        <p v-if="checksQuery.isPending.value && checksQuery.isFetching.value">
          Running the checks…
        </p>
        <p v-if="checksQuery.error.value" role="alert" class="text-danger">
          Could not run the checks: {{ checksQuery.error.value.message }}
        </p>
        <template v-if="report">
          <p
            class="rounded border-l-4 px-4 py-2"
            :class="report.canPublish ? 'border-primary bg-surface' : 'border-danger bg-surface'"
          >
            <template v-if="report.canPublish">
              Nothing blocks publishing. Publishing asks for the confirmations below.
            </template>
            <template v-else>Publishing is blocked until the checks marked below pass.</template>
          </p>
          <div v-for="group in fired" :key="group.level" class="space-y-1">
            <h4 :id="`${id}-level-${group.level}`" class="font-medium">{{ group.label }}</h4>
            <ul :aria-labelledby="`${id}-level-${group.level}`" class="list-disc space-y-1 pl-6">
              <li v-for="check in group.checks" :key="check.id">{{ check.message }}</li>
            </ul>
          </div>
          <details>
            <summary class="cursor-pointer">
              {{ passed.length }} {{ passed.length === 1 ? 'check' : 'checks' }} passed
            </summary>
            <ul class="mt-1 list-disc space-y-1 pl-6 text-muted-foreground">
              <li v-for="check in passed" :key="check.id">{{ check.message }}</li>
            </ul>
          </details>
        </template>
      </section>

      <section v-if="report" class="space-y-3" :aria-labelledby="`${id}-diff`">
        <h3 :id="`${id}-diff`" class="font-display text-xl font-medium text-heading">
          Compared with the published list
        </h3>
        <p v-if="!checksQuery.data.value?.hasPublished" class="text-muted-foreground">
          Nothing is published for this state yet, so every code is new.
        </p>
        <div class="overflow-x-auto">
          <table class="border-collapse text-left text-sm">
            <caption class="sr-only">
              Changes by code system
            </caption>
            <thead class="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" class="py-2 pr-4 font-medium">Code system</th>
                <th scope="col" class="py-2 pr-4 text-right font-medium">Added</th>
                <th scope="col" class="py-2 pr-4 text-right font-medium">Removed</th>
                <th scope="col" class="py-2 pr-4 text-right font-medium">Description changed</th>
                <th scope="col" class="py-2 text-right font-medium">Category changed</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in systems" :key="s.label" class="border-b border-border">
                <th scope="row" class="py-1.5 pr-4 font-medium">{{ s.label }}</th>
                <td class="py-1.5 pr-4 text-right">{{ n(s.counts.added) }}</td>
                <td class="py-1.5 pr-4 text-right">{{ n(s.counts.removed) }}</td>
                <td class="py-1.5 pr-4 text-right">{{ n(s.counts.descriptionChanged) }}</td>
                <td class="py-1.5 text-right">{{ n(s.counts.categoryChanged) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label :for="`${id}-kind`" class="text-sm font-medium">Show changes</label>
            <select
              :id="`${id}-kind`"
              v-model="kind"
              class="mt-1 block rounded border border-input-border bg-background px-2 py-1"
            >
              <option v-for="(label, value) in kindLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </div>
          <button type="button" :class="smallButton" @click="downloadCsv">
            Download the diff (CSV)
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              Changed codes
            </caption>
            <thead class="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" class="py-2 pr-3 font-medium">Change</th>
                <th scope="col" class="py-2 pr-3 font-medium">Code</th>
                <th scope="col" class="py-2 pr-3 font-medium">Before</th>
                <th scope="col" class="py-2 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(c, i) in pageChanges"
                :key="`${c.kind}-${c.codeSystem}-${c.code}-${i}`"
                class="border-b border-border align-top"
              >
                <td class="py-1.5 pr-3">{{ kindLabels[c.kind] }}</td>
                <td class="py-1.5 pr-3">
                  <span class="font-mono">{{ c.code }}</span>
                  <span class="block text-xs text-muted-foreground">{{
                    codeSystemLabels[c.codeSystem]
                  }}</span>
                </td>
                <td class="py-1.5 pr-3">{{ c.before }}</td>
                <td class="py-1.5">{{ c.after }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="changes.length > PAGE_SIZE" class="flex items-center gap-3">
          <button type="button" :class="smallButton" :disabled="page === 0" @click="page--">
            Previous page
          </button>
          <span
            >Changes {{ page * PAGE_SIZE + 1 }}–{{
              Math.min((page + 1) * PAGE_SIZE, changes.length)
            }}
            of {{ changes.length }}</span
          >
          <button
            type="button"
            :class="smallButton"
            :disabled="(page + 1) * PAGE_SIZE >= changes.length"
            @click="page++"
          >
            Next page
          </button>
        </div>
      </section>

      <PublishPanel
        v-if="draft.status === 'draft' && checksQuery.data.value"
        :version-id="draft.id"
        :version-no="draft.versionNo"
        :state-id="draft.stateId"
        :state-name="stateName || draft.stateId"
        :checks="checksQuery.data.value"
      />

      <div v-if="draft.status === 'draft'" class="flex flex-wrap items-center gap-3">
        <button v-if="!confirming" type="button" :class="smallButton" @click="confirming = true">
          Discard this draft
        </button>
        <template v-else>
          <span>Discard draft v{{ draft.versionNo }}? The published list does not change.</span>
          <button
            type="button"
            class="rounded bg-danger px-3 py-1 text-sm text-on-primary"
            :disabled="discard.isPending.value"
            @click="discard.mutate()"
          >
            Yes, discard draft v{{ draft.versionNo }}
          </button>
          <button type="button" :class="smallButton" @click="confirming = false">Keep it</button>
        </template>
        <p v-if="discard.error.value" role="alert" class="text-danger">
          Could not discard: {{ discard.error.value.message }}
        </p>
      </div>
    </template>
  </section>
</template>
