<script setup lang="ts">
import {
  codeSystemLabels,
  codeSystems,
  federalCategories,
  federalCategoryInfo,
  type PublicStateSummary,
  stateCategoryName,
} from '@mfcd/shared'
import { computed } from 'vue'

import type { CompareSelection } from '../../lib/public-compare'
import { usePublicState } from '../../lib/public-states'

// The compare page's choices. Every change goes straight to the model; the page turns a
// complete selection into the URL.

const selection = defineModel<CompareSelection>({ required: true })
const props = defineProps<{ states: readonly PublicStateSummary[] }>()

/** Only states with a list can be compared. */
const withList = computed(() => props.states.filter((s) => s.published !== null))

function update(patch: Partial<CompareSelection>) {
  selection.value = { ...selection.value, ...patch }
}

const ownSlug = computed(() => selection.value.ownState.toLowerCase())
const ownState = usePublicState(ownSlug)

/** The own state's categories, once each (a category split by chapter shows up twice). */
const ownCategories = computed(() => {
  const seen = new Map<string, { category: string; subcategory: string; name: string }>()
  for (const c of ownState.data.value?.categories ?? []) {
    const value = JSON.stringify([c.stateCategory, c.stateSubcategory])
    if (!seen.has(value)) {
      seen.set(value, {
        category: c.stateCategory,
        subcategory: c.stateSubcategory,
        name: stateCategoryName(c.stateCategory, c.stateSubcategory),
      })
    }
  }
  return [...seen.entries()]
    .map(([value, c]) => ({ value, ...c }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const ownCategoryValue = computed(() =>
  selection.value.ownCategory === null
    ? ''
    : JSON.stringify([selection.value.ownCategory, selection.value.ownSubcategory]),
)

function chooseOwnCategory(value: string) {
  const picked = ownCategories.value.find((c) => c.value === value)
  update({ ownCategory: picked?.category ?? null, ownSubcategory: picked?.subcategory ?? '' })
}

function toggleState(id: string, on: boolean) {
  const rest = selection.value.states.filter((s) => s !== id)
  update({ states: on ? [...rest, id] : rest })
}

const otherStates = computed(() =>
  withList.value.filter(
    (s) => selection.value.mode === 'federal' || s.id !== selection.value.ownState,
  ),
)

const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
const checkedOf = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="space-y-6" @submit.prevent>
    <fieldset class="space-y-2">
      <legend class="font-semibold">Compare by</legend>
      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            value="federal"
            :checked="selection.mode === 'federal'"
            @change="update({ mode: 'federal' })"
          />
          A federal category in the law
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            value="own"
            :checked="selection.mode === 'own'"
            @change="update({ mode: 'own' })"
          />
          A state’s own category
        </label>
      </div>
    </fieldset>

    <div class="flex flex-wrap gap-4">
      <div v-if="selection.mode === 'federal'" class="flex flex-col gap-1">
        <label for="compare-federal" class="text-sm font-semibold">Federal category</label>
        <select
          id="compare-federal"
          class="rounded border border-input-border bg-background px-2 py-1.5"
          :value="selection.category"
          @change="update({ category: valueOf($event) as CompareSelection['category'] })"
        >
          <option value="">Choose a category</option>
          <option v-for="c in federalCategories" :key="c" :value="c">
            {{ federalCategoryInfo[c].label }}
          </option>
        </select>
      </div>

      <template v-else>
        <div class="flex flex-col gap-1">
          <label for="compare-own-state" class="text-sm font-semibold">State</label>
          <select
            id="compare-own-state"
            class="rounded border border-input-border bg-background px-2 py-1.5"
            :value="selection.ownState"
            @change="update({ ownState: valueOf($event), ownCategory: null, ownSubcategory: '' })"
          >
            <option value="">Choose a state</option>
            <option v-for="s in withList" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="compare-own-category" class="text-sm font-semibold">Category</label>
          <select
            id="compare-own-category"
            class="rounded border border-input-border bg-background px-2 py-1.5"
            :value="ownCategoryValue"
            :disabled="selection.ownState === ''"
            @change="chooseOwnCategory(valueOf($event))"
          >
            <option value="">Choose a category</option>
            <option v-for="c in ownCategories" :key="c.value" :value="c.value">
              {{ c.name }}
            </option>
          </select>
        </div>
      </template>

      <div class="flex flex-col gap-1">
        <label for="compare-system" class="text-sm font-semibold">Code system</label>
        <select
          id="compare-system"
          class="rounded border border-input-border bg-background px-2 py-1.5"
          :value="selection.system"
          @change="update({ system: valueOf($event) as CompareSelection['system'] })"
        >
          <option value="">All code systems</option>
          <option v-for="s in codeSystems" :key="s" :value="s">{{ codeSystemLabels[s] }}</option>
        </select>
      </div>
    </div>

    <fieldset class="space-y-2">
      <legend class="font-semibold">
        States<span v-if="selection.mode === 'own'" class="font-normal"> to compare with</span>
      </legend>
      <p v-if="withList.length === 0" class="text-sm text-muted-foreground">
        No state has a list on this site yet.
      </p>
      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <label v-for="s in otherStates" :key="s.id" class="flex items-center gap-2">
          <input
            type="checkbox"
            :checked="selection.states.includes(s.id)"
            @change="toggleState(s.id, checkedOf($event))"
          />{{ s.name }}
        </label>
      </div>
    </fieldset>

    <label class="flex items-center gap-2">
      <input
        type="checkbox"
        :checked="selection.alone"
        @change="update({ alone: checkedOf($event) })"
      />
      Only codes that qualify alone in at least one state
    </label>
  </form>
</template>
