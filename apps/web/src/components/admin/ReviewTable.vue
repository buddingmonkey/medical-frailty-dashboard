<script setup lang="ts">
import {
  acceptableFlags,
  type CodeSystem,
  codeSystemLabels,
  codeSystems,
  formatCode,
  type MappedRow,
  type Qualification,
  qualificationLabels,
  qualificationOptions,
  type ReviewEdits,
  type ReviewFlag,
  type ReviewResult,
  reviewFlagLabels,
  reviewNoteLabels,
  type ReviewRow,
  type RowEdit,
} from '@mfcd/shared'
import { computed, reactive, ref, useId, watch } from 'vue'

// Review of mapped rows (docs/ingestion.md, step 5): flags, inline edits, drops. The edits are
// a v-model so the page can send the reviewed rows to a draft (step 7).
// The page builds the review (buildReview) from the rows, these edits and the CMS lookups, so
// the same result feeds this table, the lookups and the draft upload.
const props = defineProps<{ review: ReviewResult }>()
const edits = defineModel<ReviewEdits>('edits', { required: true })
/** The source writes ICD-10-CM codes without dots (NE). */
const undottedIcd = defineModel<boolean>('undottedIcd', { required: true })

const id = useId()
const PAGE_SIZE = 50

const review = computed(() => props.review)

// --- Filters ----------------------------------------------------------------------------------
type Show =
  | 'attention'
  | 'all'
  | 'problem'
  | 'needs_review'
  | 'ready'
  | 'not_in_reference'
  | 'edited'
  | 'dropped'
const showLabels: Record<Show, string> = {
  attention: 'Needs attention',
  all: 'All rows',
  problem: 'Cannot be read',
  needs_review: 'Needs a decision',
  ready: 'Ready',
  not_in_reference: 'Not in the CMS lists',
  edited: 'Edited',
  dropped: 'Dropped',
}
const show = ref<Show>('attention')
const group = ref('')
const search = ref('')
const page = ref(0)

const groupOf = (r: MappedRow) => (r.subcategory ? `${r.category} / ${r.subcategory}` : r.category)
const groups = computed(() =>
  [...new Set(review.value.rows.map((r) => groupOf(r.row)))].filter((g) => g !== '').sort(),
)

function matchesShow(r: ReviewRow): boolean {
  switch (show.value) {
    case 'all':
      return true
    case 'attention':
      return r.status === 'problem' || r.status === 'needs_review'
    case 'edited':
      return r.edited
    case 'not_in_reference':
      return r.notes.includes('not_in_reference')
    default:
      return r.status === show.value
  }
}

const shown = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return review.value.rows.filter(
    (r) =>
      matchesShow(r) &&
      (group.value === '' || groupOf(r.row) === group.value) &&
      (needle === '' ||
        r.row.rawCode.toLowerCase().includes(needle) ||
        r.row.description.toLowerCase().includes(needle) ||
        r.key.toLowerCase().includes(needle)),
  )
})
const pageCount = computed(() => Math.max(1, Math.ceil(shown.value.length / PAGE_SIZE)))
const pageRows = computed(() =>
  shown.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE),
)
watch([show, group, search], () => {
  page.value = 0
})
watch(pageCount, (count) => {
  if (page.value >= count) page.value = count - 1
})

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`
const summaryText = computed(() => {
  const s = review.value.summary
  const parts = [
    `${String(s.ready)} ready`,
    `${String(s.needsReview)} ${s.needsReview === 1 ? 'needs' : 'need'} a decision`,
    `${String(s.problems)} cannot be read`,
  ]
  if (s.dropped > 0) parts.push(`${String(s.dropped)} dropped`)
  return `${plural(s.total, 'row', 'rows')}: ${parts.join(', ')}.`
})

// --- Changing edits ---------------------------------------------------------------------------
function patch(changes: Record<string, RowEdit>) {
  const next = { ...edits.value }
  for (const [key, change] of Object.entries(changes)) next[key] = { ...next[key], ...change }
  edits.value = next
}
const patchOne = (key: string, change: RowEdit) => {
  patch({ [key]: change })
}

function accept(r: ReviewRow, flags: readonly ReviewFlag[]): RowEdit {
  return { accepted: [...new Set([...(edits.value[r.key]?.accepted ?? []), ...flags])] }
}

const live = computed(() => shown.value.filter((r) => !r.dropped))
const scopeRows = computed(() => live.value.filter((r) => r.openFlags.includes('category_scope')))
const acceptRows = computed(() =>
  live.value.filter((r) => r.openFlags.some((f) => acceptableFlags.includes(f))),
)

function bulkScope(value: 0 | 1) {
  patch(Object.fromEntries(scopeRows.value.map((r) => [r.key, { includesChildren: value }])))
}
function bulkAccept() {
  patch(
    Object.fromEntries(
      acceptRows.value.map((r) => [
        r.key,
        accept(
          r,
          r.openFlags.filter((f) => acceptableFlags.includes(f)),
        ),
      ]),
    ),
  )
}

type SystemChoice = CodeSystem | 'infer' | ''
const bulkSystem = ref<SystemChoice>('')
function applyBulkSystem() {
  if (bulkSystem.value === '') return
  const value: CodeSystem | '' = bulkSystem.value === 'infer' ? '' : bulkSystem.value
  patch(Object.fromEntries(live.value.map((r) => [r.key, { codeSystem: value }])))
  bulkSystem.value = ''
}

// --- Inline edit ------------------------------------------------------------------------------
const editing = ref<string | null>(null)
interface Draft {
  rawCode: string
  /** 'file': the source's column decides. */
  codeSystem: SystemChoice | 'file'
  description: string
  category: string
  subcategory: string
  tier: string
  /** The state's own federal category cell (Indiana). */
  stateFederal: string
  qualification: Qualification
}
const draft = reactive<Draft>({
  rawCode: '',
  codeSystem: 'file',
  description: '',
  category: '',
  subcategory: '',
  tier: '',
  stateFederal: '',
  qualification: 'unknown',
})

function startEdit(r: ReviewRow) {
  editing.value = r.key
  const system = edits.value[r.key]?.codeSystem
  Object.assign(draft, {
    rawCode: r.row.rawCode,
    codeSystem: system === undefined ? 'file' : system === '' ? 'infer' : system,
    description: r.row.description,
    category: r.row.category,
    subcategory: r.row.subcategory,
    tier: r.row.tier,
    stateFederal: r.row.stateFederal,
    qualification: r.row.qualification,
  })
}

const TEXT_FIELDS = [
  'rawCode',
  'description',
  'category',
  'subcategory',
  'tier',
  'stateFederal',
] as const

function saveEdit(r: ReviewRow) {
  const { accepted, includesChildren, dropped } = edits.value[r.key] ?? {}
  const next: RowEdit = {}
  if (accepted) next.accepted = accepted
  if (includesChildren !== undefined) next.includesChildren = includesChildren
  if (dropped !== undefined) next.dropped = dropped
  for (const field of TEXT_FIELDS) {
    const value = draft[field].trim()
    if (value !== r.source[field]) next[field] = value
  }
  if (draft.qualification !== r.source.qualification) next.qualification = draft.qualification
  if (draft.codeSystem !== 'file' && draft.codeSystem !== '') {
    next.codeSystem = draft.codeSystem === 'infer' ? '' : draft.codeSystem
  }
  const others = Object.entries(edits.value).filter(([key]) => key !== r.key)
  edits.value = Object.fromEntries(
    Object.keys(next).length === 0 ? others : [...others, [r.key, next]],
  )
  editing.value = null
}

const statusLabels: Record<ReviewRow['status'], string> = {
  ready: 'Ready',
  needs_review: 'Needs a decision',
  problem: 'Cannot be read',
  dropped: 'Dropped',
}

/** Parsed codes as the site will show them, with their code system. */
function parsedText(r: ReviewRow): string {
  return r.codes
    .map((c) => {
      const start = formatCode(c.codeSystem, c.codeNorm)
      const code = c.rangeEndNorm ? `${start}–${formatCode(c.codeSystem, c.rangeEndNorm)}` : start
      return `${code}${c.matchKind === 'prefix' ? '*' : ''} (${codeSystemLabels[c.codeSystem]})`
    })
    .join(', ')
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-2 py-1 text-foreground'
const smallButton = 'rounded border border-border px-2 py-0.5 text-sm hover:bg-surface'
</script>

<template>
  <section class="space-y-4" :aria-labelledby="`${id}-title`">
    <h3 :id="`${id}-title`" class="font-display text-xl font-medium text-heading">Review rows</h3>
    <p aria-live="polite" class="text-foreground">{{ summaryText }}</p>

    <label class="flex items-center gap-2">
      <input v-model="undottedIcd" type="checkbox" />
      ICD-10-CM codes are written without dots (e.g. Nebraska’s <code>A0103</code>)
    </label>

    <div class="flex flex-wrap items-end gap-4">
      <div>
        <label :for="`${id}-show`" class="text-sm font-medium">Show</label>
        <select :id="`${id}-show`" v-model="show" :class="inputClass">
          <option v-for="(label, value) in showLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
      <div>
        <label :for="`${id}-group`" class="text-sm font-medium">Category</label>
        <select :id="`${id}-group`" v-model="group" :class="inputClass">
          <option value="">All categories</option>
          <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
        </select>
      </div>
      <div>
        <label :for="`${id}-search`" class="text-sm font-medium">Search</label>
        <input
          :id="`${id}-search`"
          v-model="search"
          type="search"
          :class="inputClass"
          placeholder="Code, description or page"
        />
      </div>
    </div>

    <div
      v-if="live.length > 0"
      class="flex flex-wrap items-end gap-3 rounded border border-border p-3"
    >
      <div>
        <label :for="`${id}-bulk-system`" class="text-sm font-medium"
          >Code system for the {{ plural(live.length, 'row', 'rows') }} shown</label
        >
        <select :id="`${id}-bulk-system`" v-model="bulkSystem" :class="inputClass">
          <option value="" disabled>Choose</option>
          <option value="infer">Guess from each code</option>
          <option v-for="s in codeSystems" :key="s" :value="s">{{ codeSystemLabels[s] }}</option>
        </select>
      </div>
      <button
        type="button"
        :class="smallButton"
        :disabled="bulkSystem === ''"
        @click="applyBulkSystem"
      >
        Set code system
      </button>
      <template v-if="scopeRows.length > 0">
        <button type="button" :class="smallButton" @click="bulkScope(1)">
          Whole category for all shown
        </button>
        <button type="button" :class="smallButton" @click="bulkScope(0)">
          This code only for all shown
        </button>
      </template>
      <button v-if="acceptRows.length > 0" type="button" :class="smallButton" @click="bulkAccept">
        Accept flags for all shown
      </button>
    </div>

    <p v-if="shown.length === 0" class="text-muted-foreground">
      <template v-if="show === 'attention'"
        >No rows need attention. Choose “{{ showLabels.all }}” to see every row.</template
      >
      <template v-else>No rows match.</template>
    </p>

    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          Rows to review
        </caption>
        <thead class="border-b border-border text-muted-foreground">
          <tr>
            <th scope="col" class="py-2 pr-3 font-medium">Code</th>
            <th scope="col" class="py-2 pr-3 font-medium">Description</th>
            <th scope="col" class="py-2 pr-3 font-medium">Category</th>
            <th scope="col" class="py-2 pr-3 font-medium">Qualification</th>
            <th scope="col" class="py-2 pr-3 font-medium">Review</th>
            <th scope="col" class="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in pageRows" :key="r.key">
            <tr class="border-b border-border align-top" :class="{ 'opacity-60': r.dropped }">
              <td class="py-1.5 pr-3">
                <span class="font-mono">{{ r.row.rawCode }}</span>
                <span v-if="r.codes.length > 0" class="block text-xs text-muted-foreground">{{
                  parsedText(r)
                }}</span>
                <span class="block text-xs text-muted-foreground">{{ r.key }}</span>
              </td>
              <td class="py-1.5 pr-3 whitespace-pre-line">{{ r.row.description }}</td>
              <td class="py-1.5 pr-3">
                {{ groupOf(r.row) }}
                <span v-if="r.row.tier" class="block text-xs text-muted-foreground">{{
                  r.row.tier
                }}</span>
                <span v-if="r.row.stateFederal" class="block text-xs text-muted-foreground"
                  >State’s federal category: {{ r.row.stateFederal }}</span
                >
              </td>
              <td class="py-1.5 pr-3">{{ qualificationLabels[r.row.qualification] }}</td>
              <td class="space-y-1 py-1.5 pr-3">
                <span
                  class="font-medium"
                  :class="r.status === 'problem' ? 'text-danger' : 'text-foreground'"
                  >{{ statusLabels[r.status] }}</span
                >
                <span
                  v-if="r.edited"
                  class="ml-1 rounded bg-surface px-1 text-xs text-muted-foreground"
                  >Edited</span
                >
                <p v-for="p in r.problems" :key="p.raw + p.problem" class="text-danger">
                  <span class="font-mono">{{ p.raw }}</span
                  >: {{ p.message }}
                </p>
                <div v-for="f in r.openFlags" :key="f" class="flex flex-wrap items-center gap-1">
                  <span>{{ reviewFlagLabels[f] }}</span>
                  <template v-if="f === 'category_scope'">
                    <button
                      type="button"
                      :class="smallButton"
                      @click="patchOne(r.key, { includesChildren: 1 })"
                    >
                      Whole category
                    </button>
                    <button
                      type="button"
                      :class="smallButton"
                      @click="patchOne(r.key, { includesChildren: 0 })"
                    >
                      This code only
                    </button>
                  </template>
                  <template v-else-if="f === 'system_ambiguous'">
                    <button
                      type="button"
                      :class="smallButton"
                      @click="patchOne(r.key, { codeSystem: 'icd10cm' })"
                    >
                      ICD-10-CM
                    </button>
                    <button
                      type="button"
                      :class="smallButton"
                      @click="patchOne(r.key, { codeSystem: 'hcpcs' })"
                    >
                      HCPCS
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    :class="smallButton"
                    @click="patchOne(r.key, accept(r, [f]))"
                  >
                    Accept
                  </button>
                </div>
                <p v-for="n in r.notes" :key="n" class="text-xs text-muted-foreground">
                  {{ reviewNoteLabels[n] }}
                </p>
                <p v-for="f in r.acceptedFlags" :key="f" class="text-xs text-muted-foreground">
                  Accepted: {{ reviewFlagLabels[f] }}
                </p>
              </td>
              <td class="py-1.5">
                <div class="flex flex-wrap gap-1">
                  <button
                    type="button"
                    :class="smallButton"
                    :aria-label="`Edit row ${r.key}`"
                    @click="startEdit(r)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    :class="smallButton"
                    :aria-label="`${r.dropped ? 'Restore' : 'Drop'} row ${r.key}`"
                    @click="patchOne(r.key, { dropped: !r.dropped })"
                  >
                    {{ r.dropped ? 'Restore' : 'Drop' }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="editing === r.key" class="border-b border-border">
              <td colspan="6" class="py-3">
                <fieldset class="grid gap-3 rounded border border-border p-3 md:grid-cols-3">
                  <legend class="px-1 font-medium">Edit row {{ r.key }}</legend>
                  <div>
                    <label :for="`${id}-e-code`" class="text-sm">Code</label>
                    <input :id="`${id}-e-code`" v-model="draft.rawCode" :class="inputClass" />
                  </div>
                  <div>
                    <label :for="`${id}-e-system`" class="text-sm">Code system</label>
                    <select :id="`${id}-e-system`" v-model="draft.codeSystem" :class="inputClass">
                      <option value="file">As in the file</option>
                      <option value="infer">Guess from the code</option>
                      <option v-for="s in codeSystems" :key="s" :value="s">
                        {{ codeSystemLabels[s] }}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label :for="`${id}-e-qual`" class="text-sm">Qualification</label>
                    <select :id="`${id}-e-qual`" v-model="draft.qualification" :class="inputClass">
                      <option v-for="q in qualificationOptions" :key="q" :value="q">
                        {{ qualificationLabels[q] }}
                      </option>
                    </select>
                  </div>
                  <div class="md:col-span-3">
                    <label :for="`${id}-e-desc`" class="text-sm">Description</label>
                    <textarea
                      :id="`${id}-e-desc`"
                      v-model="draft.description"
                      rows="2"
                      :class="inputClass"
                    />
                  </div>
                  <div>
                    <label :for="`${id}-e-cat`" class="text-sm">Category</label>
                    <input :id="`${id}-e-cat`" v-model="draft.category" :class="inputClass" />
                  </div>
                  <div>
                    <label :for="`${id}-e-sub`" class="text-sm">Subcategory</label>
                    <input :id="`${id}-e-sub`" v-model="draft.subcategory" :class="inputClass" />
                  </div>
                  <div>
                    <label :for="`${id}-e-tier`" class="text-sm">Tier</label>
                    <input :id="`${id}-e-tier`" v-model="draft.tier" :class="inputClass" />
                  </div>
                  <div class="md:col-span-3">
                    <label :for="`${id}-e-federal`" class="text-sm">State’s federal category</label>
                    <input
                      :id="`${id}-e-federal`"
                      v-model="draft.stateFederal"
                      :aria-describedby="`${id}-e-federal-hint`"
                      :class="inputClass"
                    />
                    <p :id="`${id}-e-federal-hint`" class="mt-1 text-xs text-muted-foreground">
                      One of the five federal categories in the law, as the state wrote it. Put “;”
                      between two. Leave empty when the state names none.
                    </p>
                  </div>
                  <div class="flex gap-2 md:col-span-3">
                    <button
                      type="button"
                      class="rounded bg-primary px-3 py-1 text-on-primary hover:bg-primary-hover"
                      @click="saveEdit(r)"
                    >
                      Save
                    </button>
                    <button type="button" :class="smallButton" @click="editing = null">
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="shown.length > PAGE_SIZE" class="flex items-center gap-3">
      <button type="button" :class="smallButton" :disabled="page === 0" @click="page--">
        Previous page
      </button>
      <span
        >Rows {{ page * PAGE_SIZE + 1 }}–{{ Math.min((page + 1) * PAGE_SIZE, shown.length) }} of
        {{ shown.length }}</span
      >
      <button type="button" :class="smallButton" :disabled="page >= pageCount - 1" @click="page++">
        Next page
      </button>
    </div>
  </section>
</template>
