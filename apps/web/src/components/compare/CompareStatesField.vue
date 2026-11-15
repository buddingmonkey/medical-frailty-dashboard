<script setup lang="ts">
import { COMPARE_STATES, compareStatesSummary, sortStateIds } from '@mfcd/shared'
import { computed, ref, useId } from 'vue'

// The states to compare (project lead, 2026-11-13), as GOV.UK's "option select" and the search
// page's filter: a disclosure with two presets, a name filter and native checkboxes. Tab and
// Space only; no key model of its own. The choice is always alphabetical by name.

const props = defineProps<{
  /** The states that can be chosen (those with a list), by name. */
  choices: readonly { id: string; name: string }[]
  legend: string
}>()
const states = defineModel<string[]>('states', { required: true })

const id = useId()
/** Open while nothing is chosen, so the choices are in view; closed once there is a choice. */
const open = ref(states.value.length === 0)
const filter = ref('')

const names = computed(() => new Map(props.choices.map((c) => [c.id, c.name])))
const summary = computed(() =>
  compareStatesSummary(sortStateIds(states.value).map((s) => names.value.get(s) ?? s)),
)

/** The choices whose name matches the filter, and every checked one. */
const shown = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  return props.choices.filter(
    (c) => needle === '' || c.name.toLowerCase().includes(needle) || states.value.includes(c.id),
  )
})

function toggle(stateId: string, on: boolean) {
  const rest = states.value.filter((s) => s !== stateId)
  states.value = sortStateIds(on ? [...rest, stateId] : rest)
}

const chooseAll = () => (states.value = sortStateIds(props.choices.map((c) => c.id)))
const clear = () => (states.value = [])

const onToggle = (e: Event) => (open.value = (e.target as HTMLDetailsElement).open)
const checkedOf = (e: Event) => (e.target as HTMLInputElement).checked
const valueOf = (e: Event) => (e.target as HTMLInputElement).value
</script>

<template>
  <details
    class="rounded border border-input-border bg-background px-3 py-2"
    :open="open"
    @toggle="onToggle"
  >
    <summary class="cursor-pointer">
      <span class="font-semibold">{{ legend }}:</span> {{ summary }}
    </summary>
    <div class="mt-3 space-y-3 pb-1">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded border border-input-border px-3 py-1.5"
          @click="chooseAll"
        >
          {{ COMPARE_STATES.all }}
        </button>
        <button type="button" class="rounded border border-input-border px-3 py-1.5" @click="clear">
          {{ COMPARE_STATES.clear }}
        </button>
      </div>
      <div class="flex max-w-full flex-col gap-1">
        <label :for="`${id}-filter`" class="text-sm font-semibold">
          {{ COMPARE_STATES.filterLabel }}
        </label>
        <input
          :id="`${id}-filter`"
          type="text"
          autocomplete="off"
          class="max-w-full rounded border border-input-border bg-background px-2 py-1.5 sm:w-64"
          :value="filter"
          @input="filter = valueOf($event)"
        />
      </div>
      <p role="status" class="text-sm text-muted-foreground">
        {{ COMPARE_STATES.shown(shown.length) }}
      </p>
      <fieldset>
        <legend class="sr-only">{{ legend }}</legend>
        <ul class="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <li v-for="s in shown" :key="s.id">
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                class="size-4"
                :checked="states.includes(s.id)"
                @change="toggle(s.id, checkedOf($event))"
              />{{ s.name }}
            </label>
          </li>
        </ul>
      </fieldset>
    </div>
  </details>
</template>
