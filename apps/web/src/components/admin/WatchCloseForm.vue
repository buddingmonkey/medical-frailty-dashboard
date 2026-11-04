<script setup lang="ts">
import { ref, useId } from 'vue'

defineProps<{ saving?: boolean }>()

const emit = defineEmits<{
  close: [status: 'done' | 'dismissed', resolutionMd: string]
  cancel: []
}>()

const id = useId()
const status = ref<'done' | 'dismissed'>('done')
const note = ref('')
const problem = ref(false)

function submit() {
  problem.value = note.value.trim() === ''
  if (!problem.value) emit('close', status.value, note.value.trim())
}
</script>

<template>
  <form class="mt-3 space-y-3 rounded border border-border p-3" novalidate @submit.prevent="submit">
    <p v-if="problem" :id="`${id}-problem`" role="alert" class="text-danger">
      Write a resolution note: what happened, and how you checked.
    </p>
    <fieldset class="flex gap-4">
      <legend class="sr-only">Outcome</legend>
      <label class="flex items-center gap-1">
        <input v-model="status" type="radio" :name="`${id}-status`" value="done" /> Done
      </label>
      <label class="flex items-center gap-1">
        <input v-model="status" type="radio" :name="`${id}-status`" value="dismissed" />
        Dismissed
      </label>
    </fieldset>
    <div>
      <label :for="`${id}-note`" class="font-medium">Resolution note</label>
      <textarea
        :id="`${id}-note`"
        v-model="note"
        rows="2"
        :aria-invalid="problem ? 'true' : undefined"
        :aria-describedby="problem ? `${id}-problem` : undefined"
        class="mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground"
      />
    </div>
    <div class="flex gap-2">
      <button
        type="submit"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="saving"
      >
        Close item
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
