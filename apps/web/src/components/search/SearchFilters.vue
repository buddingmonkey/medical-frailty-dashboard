<script setup lang="ts">
import { type CodeSystem, codeSystemLabels, codeSystems, SEARCH_PAGE } from '@mfcd/shared'
import { computed } from 'vue'

// The search page's filters (roadmap M6 step 2): one code system, and any number of the states
// with a list on this site. The states sit in a disclosure so they don't push the results down.

defineProps<{
  /** The states with a published list, by name; null while they load. */
  choices: readonly { slug: string; name: string }[] | null
}>()
const system = defineModel<CodeSystem | null>('system', { required: true })
const states = defineModel<string[]>('states', { required: true })

const systemValue = computed({
  get: () => system.value ?? '',
  set: (value: string) => {
    system.value = codeSystems.find((s) => s === value) ?? null
  },
})

const summary = computed(() =>
  states.value.length === 0
    ? SEARCH_PAGE.statesNone
    : SEARCH_PAGE.statesChosen(states.value.length),
)
</script>

<template>
  <div class="flex flex-wrap items-start gap-x-6 gap-y-3">
    <div class="flex flex-col gap-1">
      <label for="search-system" class="text-sm font-semibold">{{ SEARCH_PAGE.systemLabel }}</label>
      <select
        id="search-system"
        v-model="systemValue"
        class="rounded border border-input-border bg-background px-2 py-1.5"
      >
        <option value="">{{ SEARCH_PAGE.anySystem }}</option>
        <option v-for="s in codeSystems" :key="s" :value="s">{{ codeSystemLabels[s] }}</option>
      </select>
    </div>

    <details class="min-w-56 rounded border border-input-border bg-background px-3 py-1.5">
      <summary class="cursor-pointer">
        <span class="font-semibold">{{ SEARCH_PAGE.statesLegend }}:</span> {{ summary }}
      </summary>
      <fieldset class="mt-2 space-y-2 pb-1">
        <legend class="text-sm">{{ SEARCH_PAGE.statesHelp }}</legend>
        <p v-if="choices === null" class="text-sm text-muted-foreground">
          {{ SEARCH_PAGE.statesLoading }}
        </p>
        <ul v-else class="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li v-for="s in choices" :key="s.slug">
            <label class="flex items-center gap-2">
              <input v-model="states" type="checkbox" :value="s.slug" class="size-4" />
              {{ s.name }}
            </label>
          </li>
        </ul>
      </fieldset>
    </details>
  </div>
</template>
