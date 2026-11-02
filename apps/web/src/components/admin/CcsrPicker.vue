<script setup lang="ts">
import type { CcsrCategoryListResponse } from '@mfcd/shared'
import { computed, ref, useId } from 'vue'

type CcsrOption = CcsrCategoryListResponse['items'][number]

// Picks CCSR groups for a unified category: search by id or name, results grouped by body
// system, the chosen groups as removable chips.
const props = defineProps<{ options: readonly CcsrOption[] }>()
const selected = defineModel<string[]>({ required: true })

const id = useId()
const search = ref('')
const MAX_RESULTS = 60

const nameOf = computed(() => new Map(props.options.map((o) => [o.ccsrCategory, o.description])))

const matches = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (q === '') return []
  return props.options
    .filter(
      (o) => o.ccsrCategory.toLowerCase().includes(q) || o.description.toLowerCase().includes(q),
    )
    .slice(0, MAX_RESULTS)
})

const groups = computed(() => {
  const bySystem = new Map<string, CcsrOption[]>()
  for (const o of matches.value) {
    const list = bySystem.get(o.bodySystem) ?? []
    list.push(o)
    bySystem.set(o.bodySystem, list)
  }
  return [...bySystem].map(([bodySystem, items]) => ({ bodySystem, items }))
})

function toggle(ccsr: string, on: boolean) {
  const rest = selected.value.filter((g) => g !== ccsr)
  selected.value = on ? [...rest, ccsr].sort() : rest
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="font-medium">CCSR groups</legend>
    <p class="text-sm text-muted-foreground">
      The ICD-10-CM codes in these groups belong to the category.
    </p>

    <p v-if="selected.length === 0" class="text-sm">No groups chosen yet.</p>
    <ul v-else :aria-label="'Chosen CCSR groups'" class="flex flex-wrap gap-2">
      <li
        v-for="g in selected"
        :key="g"
        class="flex items-center gap-1 rounded-full border border-border bg-surface py-0.5 pr-1 pl-3 text-sm"
      >
        <span class="flex gap-1"
          ><span class="font-mono">{{ g }}</span
          ><span v-if="nameOf.get(g)">{{ nameOf.get(g) }}</span></span
        >
        <button
          type="button"
          class="rounded-full px-2 hover:bg-background"
          :aria-label="`Remove ${g}`"
          @click="toggle(g, false)"
        >
          ×
        </button>
      </li>
    </ul>

    <div>
      <label :for="`${id}-search`" class="text-sm font-medium">Search CCSR groups</label>
      <input
        :id="`${id}-search`"
        v-model="search"
        type="search"
        :class="inputClass"
        :aria-describedby="`${id}-count`"
      />
      <p :id="`${id}-count`" class="mt-1 text-sm text-muted-foreground" aria-live="polite">
        <template v-if="search.trim() === ''"
          >Type an id (MBD001) or part of a name. {{ options.length }} groups.</template
        >
        <template v-else-if="matches.length === 0">No group matches.</template>
        <template v-else
          >{{ matches.length }}{{ matches.length === MAX_RESULTS ? '+' : '' }}
          {{ matches.length === 1 ? 'match' : 'matches' }}</template
        >
      </p>
    </div>

    <div
      v-if="groups.length > 0"
      class="max-h-72 space-y-3 overflow-y-auto rounded border border-border p-3"
    >
      <fieldset v-for="group in groups" :key="group.bodySystem">
        <legend class="text-sm font-medium text-heading">{{ group.bodySystem }}</legend>
        <ul class="mt-1 space-y-1">
          <li v-for="o in group.items" :key="o.ccsrCategory" class="flex items-start gap-2">
            <input
              :id="`${id}-o-${o.ccsrCategory}`"
              type="checkbox"
              class="mt-1"
              :checked="selected.includes(o.ccsrCategory)"
              @change="toggle(o.ccsrCategory, ($event.target as HTMLInputElement).checked)"
            />
            <label :for="`${id}-o-${o.ccsrCategory}`" class="text-sm">
              <span class="font-mono">{{ o.ccsrCategory }}</span> {{ o.description }}
            </label>
          </li>
        </ul>
      </fieldset>
    </div>
  </fieldset>
</template>
