<script setup lang="ts">
import {
  applyMapping,
  buildReview,
  type ColumnRole,
  columnProfileResponseSchema,
  columnProfileSchema,
  columnRoleLabels,
  columnRoles,
  guessColumnRoles,
  guessUndottedIcd,
  headerKey,
  type Qualification,
  type QualificationBasis,
  qualificationBasisLabels,
  qualificationBasisOptions,
  qualificationLabels,
  qualificationOptions,
  type RawTable,
  REF_LOOKUP_MAX,
  type ReferenceIndex,
  referenceIndex,
  referenceLookupCodes,
  refLookupResponseSchema,
  type ReviewEdits,
  stateListResponseSchema,
} from '@mfcd/shared'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { computed, ref, useId, watch } from 'vue'
import { z } from 'zod'

import ReviewTable from '../../components/admin/ReviewTable.vue'
import type { ParseInput } from '../../ingest/parse'
import type { WrapDirection } from '../../ingest/pdf-layout'
import { runParser } from '../../ingest/run-parser'
import { formatTimestampDate } from '../../lib/admin-watch'
import { getJson, sendJson } from '../../lib/api'

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

// --- Source: a file or a pasted table, parsed in the browser ---------------------------------
const tables = ref<RawTable[]>([])
const tableIndex = ref(0)
const table = computed<RawTable | undefined>(() => tables.value[tableIndex.value])
const parseError = ref<string | null>(null)
const parsing = ref(false)
const pasteText = ref('')
/** PDF only: how wrapped lines were read (null for other files). */
const pdfWrap = ref<WrapDirection | null>(null)
const wrapChoice = ref<WrapDirection | 'auto'>('auto')
const wrapLabels: Record<WrapDirection, string> = {
  above: 'above the code',
  below: 'below the code',
}
let lastInput: ParseInput | null = null

/** `again`: the same file read another way; keep the current tables (and the focused wrap
 * select) on screen until the new ones arrive. */
async function parse(input: ParseInput, again = false) {
  lastInput = input
  parseError.value = null
  parsing.value = true
  if (!again) {
    tables.value = []
    pdfWrap.value = null
  }
  try {
    const result = await runParser(input)
    tables.value = result.tables
    pdfWrap.value = result.pdfWrap ?? null
    tableIndex.value = 0
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : 'Could not read this file.'
  } finally {
    parsing.value = false
  }
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  wrapChoice.value = 'auto'
  await parse({ kind: 'file', name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
}

// Read the same PDF again with the admin's choice.
async function onWrapChange() {
  if (lastInput?.kind === 'file') await parse({ ...lastInput, wrap: wrapChoice.value }, true)
}

// --- Column mapping ---------------------------------------------------------------------------
const roles = ref<ColumnRole[]>([])
const ruleMode = ref<'fixed' | 'column'>('fixed')
const ruleFrom = ref<'qualification' | 'tier'>('qualification')
const fixedValue = ref<Qualification>('unknown')
/** Chosen qualification per column value; '' = not set. */
const ruleValues = ref<Record<string, Qualification | ''>>({})
const basis = ref<QualificationBasis>('published')
const defaultCategory = ref('')
const savedOn = ref<{ at: string; by: string } | null>(null)
const saved = ref(false)

function resetMapping(header: string[]) {
  roles.value = guessColumnRoles(header)
  const hasDesignation = roles.value.includes('qualification')
  ruleMode.value = hasDesignation ? 'column' : 'fixed'
  ruleFrom.value = 'qualification'
  fixedValue.value = 'unknown'
  ruleValues.value = {}
  basis.value = 'published'
  defaultCategory.value = ''
  savedOn.value = null
  saved.value = false
}

// New table or new state: start from the guesses, then use a saved profile if there is one.
watch([table, stateId], async ([current, state]) => {
  if (!current) return
  resetMapping(current.header)
  if (!state) return
  const params = new URLSearchParams({ stateId: state, headerKey: headerKey(current.header) })
  try {
    const { item } = await getJson(
      `/api/admin/column-profiles?${params.toString()}`,
      columnProfileResponseSchema,
    )
    // No saved profile (item null), or one for another column count: keep the guesses.
    if (item?.profile.roles.length !== current.header.length) return
    roles.value = [...item.profile.roles]
    const rule = item.profile.qualification
    ruleMode.value = rule.mode
    basis.value = rule.basis
    if (rule.mode === 'fixed') fixedValue.value = rule.value
    else {
      ruleFrom.value = rule.from
      ruleValues.value = { ...rule.values }
    }
    defaultCategory.value = item.profile.defaultCategory
    savedOn.value = { at: item.updatedAt, by: item.updatedBy }
  } catch {
    // No saved profile available: keep the guesses.
  }
})

const profile = computed(() =>
  columnProfileSchema.safeParse({
    roles: roles.value,
    qualification:
      ruleMode.value === 'fixed'
        ? { mode: 'fixed', value: fixedValue.value, basis: basis.value }
        : {
            mode: 'column',
            from: ruleFrom.value,
            values: Object.fromEntries(
              Object.entries(ruleValues.value).filter(([, v]) => v !== ''),
            ),
            basis: basis.value,
          },
    defaultCategory: defaultCategory.value,
  }),
)

const profileProblems = computed(() =>
  profile.value.success ? [] : [...new Set(profile.value.error.issues.map((i) => i.message))],
)

const mapping = computed(() =>
  table.value && profile.value.success ? applyMapping(table.value, profile.value.data) : null,
)

const columnSamples = computed(() =>
  (table.value?.header ?? []).map((_, col) =>
    (table.value?.rows ?? [])
      .map((row) => (row.cells[col] ?? '').trim())
      .filter((v) => v !== '')
      .slice(0, 3)
      .join(', '),
  ),
)

/** Distinct values in the column the qualification rule reads from. */
const ruleColumnValues = computed(() => {
  const col = roles.value.indexOf(ruleFrom.value)
  if (col < 0 || !table.value) return []
  const values = new Set<string>()
  for (const row of table.value.rows) {
    const v = (row.cells[col] ?? '').trim()
    if (v !== '') values.add(v)
    if (values.size > 200) break
  }
  return [...values].sort()
})

// Every value in the column gets a select, starting at "Not set".
watch(ruleColumnValues, (values) => {
  for (const v of values) if (!(v in ruleValues.value)) ruleValues.value[v] = ''
})

// --- Review (step 5): edits start over for each new table ------------------------------------
const reviewEdits = ref<ReviewEdits>({})
const undottedIcd = ref(false)
let undottedGuessed = false
watch(table, () => {
  reviewEdits.value = {}
  undottedGuessed = false
})
// Guess once per table, from the first mapping; after that the box is the admin's.
watch(mapping, (m) => {
  if (!m || undottedGuessed) return
  undottedIcd.value = guessUndottedIcd(m.rows)
  undottedGuessed = true
})

// The CMS code lists (ref_codes) for every exact ICD-10-CM and HCPCS code, asked once per code.
// The review uses them to settle "ICD-10-CM or HCPCS?" and to show codes CMS does not list.
const reference = ref<ReferenceIndex>(new Map())
const lookupError = ref<string | null>(null)
const lookupCodes = computed(() =>
  mapping.value
    ? referenceLookupCodes(
        buildReview(mapping.value.rows, reviewEdits.value, { undottedIcd: undottedIcd.value }),
      )
    : [],
)
let lookupRun = 0
watch(lookupCodes, async (codes) => {
  const missing = codes.filter((code) => !reference.value.has(code))
  if (missing.length === 0) return
  const run = ++lookupRun
  lookupError.value = null
  try {
    for (let i = 0; i < missing.length; i += REF_LOOKUP_MAX) {
      const chunk = missing.slice(i, i + REF_LOOKUP_MAX)
      const { items } = await sendJson(
        'POST',
        '/api/admin/ref-codes/lookup',
        { codes: chunk },
        refLookupResponseSchema,
      )
      // A newer run asks for what is still missing; keep what this one learned.
      reference.value = referenceIndex(reference.value, chunk, items)
      if (run !== lookupRun) return
    }
  } catch (error) {
    if (run === lookupRun) {
      lookupError.value = error instanceof Error ? error.message : 'Unknown error'
    }
  }
})

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`

const summary = computed(() => {
  const m = mapping.value
  if (!m) return ''
  const parts = [`${plural(m.rows.length, 'row', 'rows')} mapped`]
  if (m.blankRows > 0) parts.push(`${plural(m.blankRows, 'blank row', 'blank rows')} skipped`)
  if (m.noCodeRows.length > 0) {
    const shown = m.noCodeRows.slice(0, 10).join(', ')
    const more = m.noCodeRows.length > 10 ? ` and ${String(m.noCodeRows.length - 10)} more` : ''
    parts.push(
      `${plural(m.noCodeRows.length, 'row without a code', 'rows without a code')}: ${shown}${more}`,
    )
  }
  return parts.join(' · ')
})

const save = useMutation({
  mutationFn: () => {
    if (!table.value || !profile.value.success) throw new Error('Nothing to save')
    return sendJson(
      'PUT',
      '/api/admin/column-profiles',
      { stateId: stateId.value, header: table.value.header, profile: profile.value.data },
      z.object({ ok: z.literal(true) }),
    )
  },
  onSuccess: () => {
    saved.value = true
  },
})
watch(profile, () => {
  saved.value = false
})

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Read and map a list</h2>
      <p class="max-w-prose text-muted-foreground">
        The file is read in your browser; nothing is sent until you save. Say what each column means
        once per layout: the next file with the same headers maps itself.
      </p>
    </div>

    <div class="max-w-xs">
      <label :for="`${id}-state`" class="font-medium">State</label>
      <select :id="`${id}-state`" v-model="stateId" :class="inputClass">
        <option value="" disabled>Choose a state</option>
        <option v-for="state in statesQuery.data.value ?? []" :key="state.id" :value="state.id">
          {{ state.name }}
        </option>
      </select>
    </div>

    <div v-if="stateId" class="grid max-w-4xl gap-6 md:grid-cols-2">
      <div>
        <label :for="`${id}-file`" class="font-medium">File</label>
        <input
          :id="`${id}-file`"
          type="file"
          accept=".csv,.json,.txt,.xlsx,.pdf"
          class="mt-1 block"
          @change="onFile"
        />
        <p class="mt-1 text-sm text-muted-foreground">
          Excel (.xlsx), PDF, CSV, JSON or tab-separated text. Each Excel sheet, and each PDF table
          with its own header, is its own table.
        </p>
      </div>
      <div>
        <label :for="`${id}-paste`" class="font-medium">Paste a table</label>
        <textarea
          :id="`${id}-paste`"
          v-model="pasteText"
          rows="3"
          :class="inputClass"
          placeholder="Copy the cells in a spreadsheet, header row included"
        />
        <button
          type="button"
          class="mt-2 rounded border border-border px-3 py-1.5 hover:bg-surface"
          :disabled="pasteText.trim() === ''"
          @click="parse({ kind: 'paste', text: pasteText })"
        >
          Read pasted table
        </button>
      </div>
    </div>

    <p v-if="parsing" class="text-muted-foreground">Reading…</p>
    <p v-if="parseError" role="alert" class="text-danger">{{ parseError }}</p>

    <template v-if="table && stateId">
      <div v-if="pdfWrap" class="max-w-prose">
        <label :for="`${id}-wrap`" class="font-medium">Wrapped lines</label>
        <select
          :id="`${id}-wrap`"
          v-model="wrapChoice"
          :class="inputClass"
          class="max-w-xs"
          :aria-describedby="`${id}-wrap-help`"
          @change="onWrapChange"
        >
          <option value="auto">Detect (found: {{ wrapLabels[pdfWrap] }})</option>
          <option value="above">Extra lines sit {{ wrapLabels.above }}</option>
          <option value="below">Extra lines sit {{ wrapLabels.below }}</option>
        </select>
        <p :id="`${id}-wrap-help`" class="mt-1 text-sm text-muted-foreground">
          A long cell in a PDF wraps onto extra lines. Check the mapped rows below: if a description
          is joined to the wrong code, choose the other way.
        </p>
      </div>

      <div v-if="tables.length > 1" class="max-w-xs">
        <label :for="`${id}-sheet`" class="font-medium">{{ pdfWrap ? 'Table' : 'Sheet' }}</label>
        <select :id="`${id}-sheet`" v-model="tableIndex" :class="inputClass">
          <option v-for="(t, i) in tables" :key="i" :value="i">{{ t.name }}</option>
        </select>
      </div>

      <p v-if="savedOn" class="text-muted-foreground">
        Using the column profile saved on {{ formatTimestampDate(savedOn.at) }} by {{ savedOn.by }}.
      </p>

      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Columns
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">Column</th>
              <th scope="col" class="py-2 pr-4 font-medium">Means</th>
              <th scope="col" class="py-2 font-medium">Sample values</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(header, col) in table.header"
              :key="col"
              class="border-b border-border align-top"
            >
              <th scope="row" class="py-2 pr-4 font-medium">{{ header || `Column ${col + 1}` }}</th>
              <td class="py-2 pr-4">
                <label :for="`${id}-role-${col}`" class="sr-only"
                  >Role of column “{{ header }}”</label
                >
                <select
                  :id="`${id}-role-${col}`"
                  v-model="roles[col]"
                  class="rounded border border-input-border bg-background px-2 py-1"
                >
                  <option v-for="r in columnRoles" :key="r" :value="r">
                    {{ columnRoleLabels[r] }}
                  </option>
                </select>
              </td>
              <td class="py-2 font-mono text-xs text-muted-foreground">
                {{ columnSamples[col] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <fieldset class="max-w-3xl space-y-3 rounded border border-border p-4">
        <legend class="px-1 font-medium">Does a code qualify on its own?</legend>
        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-1">
            <input v-model="ruleMode" type="radio" :name="`${id}-mode`" value="fixed" />
            Same for every row
          </label>
          <label class="flex items-center gap-1">
            <input v-model="ruleMode" type="radio" :name="`${id}-mode`" value="column" />
            From a column’s value
          </label>
        </div>

        <div v-if="ruleMode === 'fixed'" class="max-w-xs">
          <label :for="`${id}-fixed`" class="text-sm">Every row</label>
          <select :id="`${id}-fixed`" v-model="fixedValue" :class="inputClass">
            <option v-for="q in qualificationOptions" :key="q" :value="q">
              {{ qualificationLabels[q] }}
            </option>
          </select>
        </div>

        <div v-else class="space-y-2">
          <div class="max-w-xs">
            <label :for="`${id}-from`" class="text-sm">Read from the</label>
            <select :id="`${id}-from`" v-model="ruleFrom" :class="inputClass">
              <option value="qualification">Qualification column</option>
              <option value="tier">Tier column</option>
            </select>
          </div>
          <div
            v-for="value in ruleColumnValues"
            :key="value"
            class="flex flex-wrap items-center gap-2"
          >
            <label :for="`${id}-value-${value}`" class="min-w-40 text-sm"
              >Qualification for “{{ value }}”</label
            >
            <select
              :id="`${id}-value-${value}`"
              v-model="ruleValues[value]"
              class="rounded border border-input-border bg-background px-2 py-1"
            >
              <option value="">Not set</option>
              <option v-for="q in qualificationOptions" :key="q" :value="q">
                {{ qualificationLabels[q] }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex flex-wrap gap-4 text-sm">
          <span>Source of this rule:</span>
          <label v-for="b in qualificationBasisOptions" :key="b" class="flex items-center gap-1">
            <input v-model="basis" type="radio" :name="`${id}-basis`" :value="b" />
            {{ qualificationBasisLabels[b] }}
          </label>
        </div>
      </fieldset>

      <div v-if="!roles.includes('category')" class="max-w-md">
        <label :for="`${id}-category`" class="font-medium">Category for every row</label>
        <input :id="`${id}-category`" v-model="defaultCategory" type="text" :class="inputClass" />
        <p class="mt-1 text-sm text-muted-foreground">
          This file has no category column (e.g. Georgia). Categories can be refined in the mapping
          step.
        </p>
      </div>

      <div v-if="profileProblems.length > 0" role="alert" class="text-danger">
        {{ profileProblems.join('. ') }}.
      </div>

      <template v-if="mapping">
        <p class="text-foreground">{{ summary }}</p>
        <p
          v-if="mapping.unmappedQualificationValues.length > 0"
          role="alert"
          class="rounded border-l-4 border-highlight bg-surface px-4 py-2 text-foreground"
        >
          No qualification chosen for:
          {{ mapping.unmappedQualificationValues.map((v) => v || '(blank)').join(', ') }}. Those
          rows will show “{{ qualificationLabels.unknown }}”.
        </p>

        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              Mapped rows (first 20)
            </caption>
            <thead class="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" class="py-2 pr-3 font-medium">Code</th>
                <th scope="col" class="py-2 pr-3 font-medium">Description</th>
                <th scope="col" class="py-2 pr-3 font-medium">Category</th>
                <th scope="col" class="py-2 pr-3 font-medium">Tier</th>
                <th scope="col" class="py-2 pr-3 font-medium">Qualification</th>
                <th scope="col" class="py-2 font-medium">From</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in mapping.rows.slice(0, 20)"
                :key="row.locator"
                class="border-b border-border align-top"
              >
                <td class="py-1.5 pr-3 font-mono">{{ row.rawCode }}</td>
                <td class="py-1.5 pr-3">{{ row.description }}</td>
                <td class="py-1.5 pr-3">
                  {{ row.category
                  }}<template v-if="row.subcategory"> / {{ row.subcategory }}</template>
                </td>
                <td class="py-1.5 pr-3">{{ row.tier }}</td>
                <td class="py-1.5 pr-3">
                  {{ qualificationLabels[row.qualification] }}
                  <template v-if="row.qualification !== 'unknown'"
                    >({{ qualificationBasisLabels[row.qualificationBasis] }})</template
                  >
                </td>
                <td class="py-1.5 text-muted-foreground">{{ row.locator }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <p v-if="lookupError" role="alert" class="text-danger">
        Could not check the codes against the CMS lists ({{ lookupError }}). The review still works,
        but cannot settle “ICD-10-CM or HCPCS?” or show codes CMS does not list.
      </p>
      <ReviewTable
        v-if="mapping && mapping.rows.length > 0"
        v-model:edits="reviewEdits"
        v-model:undotted-icd="undottedIcd"
        :rows="mapping.rows"
        :reference="reference"
      />

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
          :disabled="!profile.success || save.isPending.value"
          @click="save.mutate()"
        >
          Save column profile
        </button>
        <p v-if="saved" role="status">Saved the column profile for {{ stateName }}.</p>
        <p v-if="save.error.value" role="alert" class="text-danger">
          Could not save: {{ save.error.value.message }}
        </p>
      </div>
      <p class="text-sm text-muted-foreground">
        Next (a later step): send the reviewed rows to a draft version.
      </p>
    </template>
  </section>
</template>
