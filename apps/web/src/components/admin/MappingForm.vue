<script setup lang="ts">
import {
  type MappingBasis,
  mappingBases,
  type MappingConfidence,
  mappingConfidences,
  type StateUnifiedCategory,
  type UnifiedListItem,
  type UnifiedMappingPut,
  unifiedMappingPutSchema,
} from '@mfcd/shared'
import { computed, reactive, ref, useId } from 'vue'

import {
  basisLabels,
  confidenceLabels,
  percent,
  relationHelp,
  relationLabels,
  stateCategoryName,
  targetRelations,
} from '../../lib/admin-unified'

type TargetRelation = (typeof targetRelations)[number]

// Maps one state category to unified categories (roadmap M5 step 3), or says "place each code
// by its CCSR group" (by_code). The suggestion comes from the CCSR groups of its codes.
const props = defineProps<{
  category: StateUnifiedCategory
  unified: readonly UnifiedListItem[]
  saving?: boolean
  serverError?: string | null
}>()

const emit = defineEmits<{
  save: [body: UnifiedMappingPut]
  cancel: []
}>()

const id = useId()
const name = computed(() => stateCategoryName(props.category))

interface TargetDraft {
  unifiedId: number | ''
  relation: TargetRelation
  basis: MappingBasis
  confidence: MappingConfidence
  rationale: string
  citation: string
}

const blankTarget = (): TargetDraft => ({
  unifiedId: '',
  relation: 'exact',
  basis: 'admin_judgement',
  confidence: 'high',
  rationale: '',
  citation: '',
})

// Start from the current proposal if there is one, else the approved mapping.
const proposed = props.category.mappings.filter((m) => m.status === 'proposed')
const current = proposed.length > 0 ? proposed : props.category.mappings
const byCodeRow = current.find((m) => m.relation === 'by_code')

const mode = ref<'targets' | 'byCode'>(byCodeRow ? 'byCode' : 'targets')
const byCode = reactive({
  basis: byCodeRow?.basis ?? 'admin_judgement',
  confidence: byCodeRow?.confidence ?? 'high',
  rationale: byCodeRow?.rationale ?? '',
  citation: byCodeRow?.citation ?? '',
})
const targets = ref<TargetDraft[]>(
  byCodeRow || current.length === 0
    ? [blankTarget()]
    : current.flatMap((m) =>
        m.unifiedId === null || m.relation === 'by_code'
          ? []
          : [
              {
                unifiedId: m.unifiedId,
                relation: m.relation,
                basis: m.basis,
                confidence: m.confidence,
                rationale: m.rationale ?? '',
                citation: m.citation ?? '',
              },
            ],
      ),
)

const choices = computed(() =>
  props.unified.filter(
    (u) => u.status !== 'retired' || targets.value.some((t) => t.unifiedId === u.id),
  ),
)
const isTarget = (unifiedId: number) => targets.value.some((t) => t.unifiedId === unifiedId)

function addSuggested(unifiedId: number) {
  mode.value = 'targets'
  const suggested: TargetDraft = {
    ...blankTarget(),
    unifiedId,
    relation: 'related',
    basis: 'ccsr_agreement',
    confidence: 'medium',
  }
  const blank = targets.value.findIndex((t) => t.unifiedId === '')
  if (blank >= 0) targets.value.splice(blank, 1, suggested)
  else targets.value.push(suggested)
}

const problem = ref<string | null>(null)

function submit(approve: boolean) {
  const nullIfBlank = (s: string) => (s.trim() === '' ? null : s)
  const key = {
    stateCategory: props.category.stateCategory,
    stateSubcategory: props.category.stateSubcategory,
    approve,
  }
  if (mode.value === 'targets' && targets.value.some((t) => t.unifiedId === '')) {
    problem.value = 'Choose a unified category for each target, or remove the empty one.'
    return
  }
  const body =
    mode.value === 'byCode'
      ? {
          ...key,
          byCode: true,
          basis: byCode.basis,
          confidence: byCode.confidence,
          rationale: nullIfBlank(byCode.rationale),
          citation: nullIfBlank(byCode.citation),
        }
      : {
          ...key,
          targets: targets.value.map((t) => ({
            ...t,
            rationale: nullIfBlank(t.rationale),
            citation: nullIfBlank(t.citation),
          })),
        }
  const result = unifiedMappingPutSchema.safeParse(body)
  if (!result.success) {
    const ids = targets.value.map((t) => t.unifiedId)
    problem.value =
      new Set(ids).size < ids.length
        ? 'Each unified category may be a target once.'
        : 'Check the fields: a rationale may have up to 4,000 characters, a citation 1,000.'
    return
  }
  problem.value = null
  emit('save', result.data)
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
const relationOption: Record<TargetRelation, string> = {
  exact: 'Exact (the same codes)',
  close: 'Close (nearly the same)',
  broad: 'Broad (unified is wider)',
  narrow: 'Narrow (unified is narrower)',
  related: 'Related (they overlap)',
}
</script>

<template>
  <form
    class="space-y-5 rounded border border-border p-4"
    :aria-label="`Map ${name}`"
    novalidate
    @submit.prevent="submit(false)"
  >
    <h3 class="font-display text-xl font-medium text-heading">Map {{ name }}</h3>
    <p class="text-sm text-muted-foreground">
      {{ category.entries }} {{ category.entries === 1 ? 'entry' : 'entries' }},
      {{ category.icdEntries }} of them ICD-10-CM.
    </p>

    <div v-if="problem || serverError" role="alert" class="space-y-1 text-danger">
      <p v-if="problem">{{ problem }}</p>
      <p v-if="serverError">Could not save: {{ serverError }}</p>
    </div>

    <section :aria-labelledby="`${id}-suggest`" class="space-y-2 rounded bg-surface p-3">
      <h4 :id="`${id}-suggest`" class="font-medium text-heading">Suggestion</h4>
      <p v-if="category.icdEntries === 0" class="text-sm">
        No ICD-10-CM entries, so CCSR has nothing to suggest.
      </p>
      <template v-else>
        <p class="text-sm">
          From the CCSR groups of its {{ category.icdEntries }} ICD-10-CM
          {{ category.icdEntries === 1 ? 'entry' : 'entries'
          }}<template v-if="category.suggestion.withoutCcsr > 0">
            ({{ category.suggestion.withoutCcsr }} with no group)</template
          >.
        </p>
        <ul
          v-if="category.suggestion.ccsr.length > 0"
          class="space-y-0.5 text-sm"
          aria-label="Top CCSR groups"
        >
          <li v-for="g in category.suggestion.ccsr" :key="g.ccsrCategory">
            <span class="font-mono">{{ g.ccsrCategory }}</span>
            {{ g.description ?? '' }}: {{ g.count }}
            {{ g.count === 1 ? 'entry' : 'entries' }}
          </li>
        </ul>
        <p v-if="category.suggestion.unified.length === 0" class="text-sm">
          No unified category has these CCSR groups yet.
        </p>
        <ul v-else class="space-y-1 text-sm" aria-label="Unified categories with these groups">
          <li
            v-for="u in category.suggestion.unified"
            :key="u.unifiedId"
            class="flex flex-wrap items-center gap-2"
          >
            <span
              >{{ u.label }}<template v-if="u.status !== 'published'"> ({{ u.status }})</template>:
              covers {{ percent(u.share) }} of the ICD-10-CM entries ({{ u.covered }})</span
            >
            <button
              type="button"
              :class="smallButton"
              :disabled="isTarget(u.unifiedId)"
              :aria-label="`${isTarget(u.unifiedId) ? 'Added' : 'Add'} ${u.label} as a target`"
              @click="addSuggested(u.unifiedId)"
            >
              <!-- The visible word starts the accessible name (WCAG 2.5.3). -->
              {{ isTarget(u.unifiedId) ? 'Added' : 'Add' }}
            </button>
          </li>
        </ul>
      </template>
    </section>

    <fieldset class="space-y-2">
      <legend class="font-medium">How to map</legend>
      <div class="flex items-center gap-2">
        <input :id="`${id}-mode-t`" v-model="mode" type="radio" value="targets" />
        <label :for="`${id}-mode-t`">Map to unified categories</label>
      </div>
      <div class="flex items-center gap-2">
        <input :id="`${id}-mode-c`" v-model="mode" type="radio" value="byCode" />
        <label :for="`${id}-mode-c`">Place each code by its CCSR group</label>
      </div>
      <p class="text-sm text-muted-foreground">
        Choose “by its CCSR group” when the state’s category is not a meaningful group (for example,
        one list of everything).
      </p>
    </fieldset>

    <div v-if="mode === 'byCode'" class="grid gap-4 md:grid-cols-2">
      <div>
        <label :for="`${id}-c-basis`" class="font-medium">Basis</label>
        <select :id="`${id}-c-basis`" v-model="byCode.basis" :class="inputClass">
          <option v-for="b in mappingBases" :key="b" :value="b">{{ basisLabels[b] }}</option>
        </select>
      </div>
      <div>
        <label :for="`${id}-c-confidence`" class="font-medium">Confidence</label>
        <select :id="`${id}-c-confidence`" v-model="byCode.confidence" :class="inputClass">
          <option v-for="c in mappingConfidences" :key="c" :value="c">
            {{ confidenceLabels[c] }}
          </option>
        </select>
      </div>
      <div>
        <label :for="`${id}-c-rationale`" class="font-medium">Rationale</label>
        <textarea
          :id="`${id}-c-rationale`"
          v-model="byCode.rationale"
          rows="2"
          :class="inputClass"
        />
      </div>
      <div>
        <label :for="`${id}-c-citation`" class="font-medium">Citation</label>
        <input :id="`${id}-c-citation`" v-model="byCode.citation" type="text" :class="inputClass" />
      </div>
    </div>

    <div v-else class="space-y-4">
      <fieldset
        v-for="(t, i) in targets"
        :key="i"
        class="space-y-3 rounded border border-border p-3"
      >
        <legend class="px-1 font-medium">Target {{ i + 1 }}</legend>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label :for="`${id}-t${i}-u`" class="text-sm font-medium"
              >Unified category for target {{ i + 1 }}</label
            >
            <select :id="`${id}-t${i}-u`" v-model="t.unifiedId" :class="inputClass">
              <option value="" disabled>Choose</option>
              <option v-for="u in choices" :key="u.id" :value="u.id">
                {{ u.label }}{{ u.status === 'published' ? '' : ` (${u.status})` }}
              </option>
            </select>
          </div>
          <div>
            <label :for="`${id}-t${i}-r`" class="text-sm font-medium"
              >Relation for target {{ i + 1 }}</label
            >
            <select
              :id="`${id}-t${i}-r`"
              v-model="t.relation"
              :class="inputClass"
              :aria-describedby="`${id}-t${i}-rh`"
            >
              <option v-for="r in targetRelations" :key="r" :value="r">
                {{ relationOption[r] }}
              </option>
            </select>
            <p :id="`${id}-t${i}-rh`" class="mt-1 text-sm text-muted-foreground">
              {{ relationLabels[t.relation] }}: {{ relationHelp[t.relation] }}.
            </p>
          </div>
          <div>
            <label :for="`${id}-t${i}-b`" class="text-sm font-medium"
              >Basis for target {{ i + 1 }}</label
            >
            <select :id="`${id}-t${i}-b`" v-model="t.basis" :class="inputClass">
              <option v-for="b in mappingBases" :key="b" :value="b">{{ basisLabels[b] }}</option>
            </select>
          </div>
          <div>
            <label :for="`${id}-t${i}-c`" class="text-sm font-medium"
              >Confidence for target {{ i + 1 }}</label
            >
            <select :id="`${id}-t${i}-c`" v-model="t.confidence" :class="inputClass">
              <option v-for="c in mappingConfidences" :key="c" :value="c">
                {{ confidenceLabels[c] }}
              </option>
            </select>
          </div>
          <div>
            <label :for="`${id}-t${i}-ra`" class="text-sm font-medium"
              >Rationale for target {{ i + 1 }}</label
            >
            <textarea :id="`${id}-t${i}-ra`" v-model="t.rationale" rows="2" :class="inputClass" />
          </div>
          <div>
            <label :for="`${id}-t${i}-ci`" class="text-sm font-medium"
              >Citation for target {{ i + 1 }}</label
            >
            <input :id="`${id}-t${i}-ci`" v-model="t.citation" type="text" :class="inputClass" />
          </div>
        </div>
        <button
          v-if="targets.length > 1"
          type="button"
          :class="smallButton"
          @click="targets.splice(i, 1)"
        >
          Remove target {{ i + 1 }}
        </button>
      </fieldset>
      <button type="button" :class="smallButton" @click="targets.push(blankTarget())">
        Add a target
      </button>
    </div>

    <p class="text-sm text-muted-foreground">
      One admin’s approval is enough. An approved mapping is shown as “Reviewed by one admin”, with
      who reviewed it and when.
    </p>
    <div class="flex flex-wrap gap-2">
      <button
        type="submit"
        class="rounded border border-border px-4 py-2 hover:bg-surface disabled:opacity-60"
        :disabled="saving"
      >
        Save as proposed
      </button>
      <button
        type="button"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="saving"
        @click="submit(true)"
      >
        Save and approve
      </button>
      <button
        type="button"
        class="rounded border border-border px-4 py-2 hover:bg-surface"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </form>
</template>
