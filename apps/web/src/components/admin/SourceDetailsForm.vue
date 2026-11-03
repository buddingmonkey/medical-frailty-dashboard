<script setup lang="ts">
import { type SourceDetails, type SourceDetailsDraft, sourceDetailsSchema } from '@mfcd/shared'
import { ref, useId } from 'vue'

defineProps<{
  /** Accessible name of the form, e.g. `Edit details of “GA list”`. */
  label: string
  saving?: boolean
  /** The server's refusal, if the last save failed. */
  error?: string | null
}>()

const emit = defineEmits<{
  save: [details: SourceDetails]
  cancel: []
}>()

const draft = defineModel<SourceDetailsDraft>({ required: true })

const id = useId()
type Field = keyof SourceDetailsDraft
const problems = ref<Partial<Record<Field, string>>>({})

function submit() {
  const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim())
  const parsed = sourceDetailsSchema.safeParse({
    title: draft.value.title,
    url: blankToNull(draft.value.url),
    publisherDate: blankToNull(draft.value.publisherDate),
  })
  problems.value = {}
  if (parsed.success) {
    emit('save', parsed.data)
    return
  }
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as Field
    problems.value[field] ??= issue.message
  }
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
</script>

<template>
  <form
    class="space-y-3 rounded border border-border p-3"
    :aria-label="label"
    novalidate
    @submit.prevent="submit"
  >
    <div>
      <label :for="`${id}-title`" class="font-medium">Title</label>
      <input
        :id="`${id}-title`"
        v-model="draft.title"
        type="text"
        maxlength="200"
        :class="inputClass"
        :aria-invalid="problems.title ? 'true' : undefined"
        :aria-describedby="problems.title ? `${id}-title-problem` : undefined"
      />
      <p v-if="problems.title" :id="`${id}-title-problem`" class="mt-1 text-sm text-danger">
        {{ problems.title }}
      </p>
    </div>
    <div>
      <label :for="`${id}-url`" class="font-medium">State’s URL for this file</label>
      <input
        :id="`${id}-url`"
        v-model="draft.url"
        type="url"
        :class="inputClass"
        :aria-invalid="problems.url ? 'true' : undefined"
        :aria-describedby="`${id}-url-hint${problems.url ? ` ${id}-url-problem` : ''}`"
      />
      <p :id="`${id}-url-hint`" class="mt-1 text-sm text-muted-foreground">
        Starts with https://. Leave blank if the state has no public copy.
      </p>
      <p v-if="problems.url" :id="`${id}-url-problem`" class="mt-1 text-sm text-danger">
        {{ problems.url }}
      </p>
    </div>
    <div class="max-w-xs">
      <label :for="`${id}-date`" class="font-medium">Date on the document</label>
      <input
        :id="`${id}-date`"
        v-model="draft.publisherDate"
        type="date"
        :class="inputClass"
        :aria-invalid="problems.publisherDate ? 'true' : undefined"
        :aria-describedby="problems.publisherDate ? `${id}-date-problem` : undefined"
      />
      <p v-if="problems.publisherDate" :id="`${id}-date-problem`" class="mt-1 text-sm text-danger">
        {{ problems.publisherDate }}
      </p>
    </div>
    <p v-if="error" role="alert" class="text-danger">Could not save: {{ error }}</p>
    <div class="flex gap-2">
      <button
        type="submit"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="saving"
      >
        {{ saving ? 'Saving…' : 'Save details' }}
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
