<script setup lang="ts">
import { STATES_COMPARE_MAX, STATES_COMPARE_MIN, STATES_PICKER_LABELS } from '@mfcd/shared'
import { computed, ref, watch } from 'vue'

// The comparison's state pickers (roadmap M5 step 7): two required and two optional selects of
// the states with a list. "Compare" emits the chosen states in order, each once.

const props = defineProps<{
  choices: readonly { id: string; name: string }[]
  /** The states compared now, in column order. */
  current: readonly string[]
}>()
const emit = defineEmits<{ compare: [ids: string[]] }>()

const labels = STATES_PICKER_LABELS.slice(0, STATES_COMPARE_MAX)
const slots = ref<string[]>([])
// Reset only when the comparison itself changes (the parent passes new arrays on every render).
// A chosen state without a list is not a choice: its select starts empty.
watch(
  () => `${props.current.join(',')}|${props.choices.map((c) => c.id).join(',')}`,
  () => {
    const known = new Set(props.choices.map((c) => c.id))
    slots.value = Array.from({ length: STATES_COMPARE_MAX }, (_, i) => {
      const id = props.current[i] ?? ''
      return known.has(id) ? id : ''
    })
  },
  { immediate: true },
)

const chosen = computed(() => [...new Set(slots.value.filter((id) => id !== ''))])
const ready = computed(() => chosen.value.length >= STATES_COMPARE_MIN)
</script>

<template>
  <form
    class="flex flex-wrap items-end gap-x-4 gap-y-3"
    role="group"
    aria-labelledby="states-picker-label"
    @submit.prevent="ready && emit('compare', chosen)"
  >
    <span id="states-picker-label" class="sr-only">States to compare</span>
    <div v-for="(label, i) in labels" :key="label" class="flex flex-col gap-1">
      <label :for="`states-picker-${i}`" class="text-sm font-semibold">{{ label }}</label>
      <select
        :id="`states-picker-${i}`"
        v-model="slots[i]"
        class="rounded border border-input-border bg-background px-2 py-1.5"
      >
        <option value="">{{ i < STATES_COMPARE_MIN ? 'Choose a state' : 'None' }}</option>
        <option v-for="s in choices" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </div>
    <button
      type="submit"
      class="rounded bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-50"
      :disabled="!ready"
    >
      Compare
    </button>
  </form>
</template>
