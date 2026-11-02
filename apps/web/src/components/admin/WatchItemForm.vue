<script setup lang="ts">
import { type WatchCreate, type WatchItem, watchCreateSchema, watchKinds } from '@mfcd/shared'
import { reactive, ref, useId } from 'vue'

import { watchKindLabels } from '../../lib/admin-watch'

const props = defineProps<{
  /** The item being edited; omit to add a new one. */
  item?: WatchItem
  /** Disables Save while the request runs. */
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [fields: WatchCreate]
  cancel: []
}>()

const id = useId()

const draft = reactive({
  title: props.item?.title ?? '',
  kind: props.item?.kind ?? 'court',
  dueDate: props.item?.dueDate ?? '',
  dateIsApproximate: props.item?.dateIsApproximate ?? false,
  whyMd: props.item?.whyMd ?? '',
  links: (props.item?.links ?? []).map((link) => ({ ...link })),
  repeatDays: props.item?.repeatDays === null ? '' : String(props.item?.repeatDays ?? ''),
})

const fieldLabels: Record<string, string> = {
  title: 'Title',
  kind: 'Kind',
  dueDate: 'Due date',
  whyMd: 'Why it matters',
  links: 'Links (each needs a label and an http or https URL)',
  repeatDays: 'Repeat every (days)',
}

const problems = ref<string[]>([])

function submit() {
  const result = watchCreateSchema.safeParse({
    title: draft.title,
    kind: draft.kind,
    stateId: props.item?.stateId ?? null,
    dueDate: draft.dueDate === '' ? null : draft.dueDate,
    dateIsApproximate: draft.dateIsApproximate,
    whyMd: draft.whyMd,
    links: draft.links,
    repeatDays: draft.repeatDays.trim() === '' ? null : Number(draft.repeatDays),
  })
  if (!result.success) {
    const fields = new Set(result.error.issues.map((issue) => String(issue.path[0])))
    problems.value = [...fields].map((field) => fieldLabels[field] ?? field)
    return
  }
  problems.value = []
  emit('save', result.data)
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
</script>

<template>
  <form class="space-y-4 rounded border border-border p-4" novalidate @submit.prevent="submit">
    <h3 class="font-display text-xl font-medium text-heading">
      {{ item ? 'Edit item' : 'Add an item' }}
    </h3>

    <div v-if="problems.length > 0" role="alert" class="text-danger">
      Fix these fields: {{ problems.join(', ') }}.
    </div>

    <div>
      <label :for="`${id}-title`" class="font-medium">Title</label>
      <input :id="`${id}-title`" v-model="draft.title" type="text" :class="inputClass" />
    </div>

    <div class="flex flex-wrap gap-4">
      <div>
        <label :for="`${id}-kind`" class="font-medium">Kind</label>
        <select :id="`${id}-kind`" v-model="draft.kind" :class="inputClass">
          <option v-for="kind in watchKinds" :key="kind" :value="kind">
            {{ watchKindLabels[kind] }}
          </option>
        </select>
      </div>
      <div>
        <label :for="`${id}-due`" class="font-medium">Due date</label>
        <input :id="`${id}-due`" v-model="draft.dueDate" type="date" :class="inputClass" />
      </div>
      <div>
        <label :for="`${id}-repeat`" class="font-medium">Repeat every (days)</label>
        <input
          :id="`${id}-repeat`"
          v-model="draft.repeatDays"
          type="text"
          inputmode="numeric"
          :class="inputClass"
        />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <input :id="`${id}-approx`" v-model="draft.dateIsApproximate" type="checkbox" />
      <label :for="`${id}-approx`">The date is approximate</label>
    </div>

    <div>
      <label :for="`${id}-why`" class="font-medium">Why it matters</label>
      <textarea :id="`${id}-why`" v-model="draft.whyMd" rows="3" :class="inputClass" />
    </div>

    <fieldset class="space-y-2">
      <legend class="font-medium">Links</legend>
      <div v-for="(link, index) in draft.links" :key="index" class="flex flex-wrap items-end gap-2">
        <div>
          <label :for="`${id}-link-${index}-label`" class="text-sm">
            Link {{ index + 1 }} label
          </label>
          <input
            :id="`${id}-link-${index}-label`"
            v-model="link.label"
            type="text"
            :class="inputClass"
          />
        </div>
        <div class="min-w-64 flex-1">
          <label :for="`${id}-link-${index}-url`" class="text-sm">Link {{ index + 1 }} URL</label>
          <input
            :id="`${id}-link-${index}-url`"
            v-model="link.url"
            type="url"
            :class="inputClass"
          />
        </div>
        <button
          type="button"
          class="rounded border border-border px-3 py-1.5 hover:bg-surface"
          @click="draft.links.splice(index, 1)"
        >
          Remove link {{ index + 1 }}
        </button>
      </div>
      <button
        type="button"
        class="rounded border border-border px-3 py-1.5 hover:bg-surface"
        @click="draft.links.push({ label: '', url: '' })"
      >
        Add a link
      </button>
    </fieldset>

    <div class="flex gap-2">
      <button
        type="submit"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="saving"
      >
        Save
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
