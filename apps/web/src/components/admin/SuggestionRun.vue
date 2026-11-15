<script setup lang="ts">
import {
  federalCategoriesText,
  federalCategoryInfo,
  type LawCategory,
  suggestionRunPreviewSchema,
} from '@mfcd/shared'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { computed, onMounted, ref, useId, useTemplateRef } from 'vue'
import { z } from 'zod'

import { ApiError, sendJson } from '../../lib/api'

// "Re-run automatic suggestions" (docs/add-state-source.md, step 8): the server's preview of
// what a run would change for the state's published entries, then a save that sends the
// preview's token back. A 409 means something changed since: the preview is fetched again.
// Reviewed suggestions, stated categories, placements, chapter overrides and mappings never
// change.
const props = defineProps<{ stateId: string; stateName: string }>()
const emit = defineEmits<{ saved: [message: string]; cancel: [] }>()

const id = useId()
const heading = useTemplateRef<HTMLElement>('heading')
onMounted(() => heading.value?.focus())

const base = computed(() => `/api/admin/states/${props.stateId}/categories/suggestions`)
const preview = useQuery({
  queryKey: ['admin', 'categories', props.stateId, 'suggestion-preview'],
  queryFn: () => sendJson('POST', `${base.value}/preview`, {}, suggestionRunPreviewSchema),
  gcTime: 0,
  staleTime: Infinity,
})

const stale = ref(false)
const save = useMutation({
  mutationFn: (token: string) =>
    sendJson('POST', `${base.value}/run`, { token }, z.object({ ok: z.literal(true) })),
  onSuccess: () => {
    emit('saved', `Saved the automatic suggestions for ${props.stateName}.`)
  },
  onError: async (error) => {
    if (error instanceof ApiError && error.status === 409) {
      stale.value = true
      await preview.refetch()
      heading.value?.focus()
    }
  },
})

function confirm() {
  const token = preview.data.value?.token
  if (!token) return
  stale.value = false
  save.reset()
  save.mutate(token)
}

const label = (f: LawCategory) => federalCategoryInfo[f].label
const n = (value: number) => value.toLocaleString('en-US')
const entriesText = (value: number) => `${n(value)} ${value === 1 ? 'entry' : 'entries'}`
const changed = computed(() => {
  const p = preview.data.value
  return p ? p.gain + p.change + p.lose : 0
})
const button = 'rounded border border-border px-4 py-2 hover:bg-surface'
</script>

<template>
  <section
    class="space-y-4 rounded border border-border bg-surface p-4"
    :aria-labelledby="`${id}-h`"
  >
    <h3
      :id="`${id}-h`"
      ref="heading"
      tabindex="-1"
      class="font-display text-xl font-medium text-heading"
    >
      Check the automatic suggestions before saving
    </h3>
    <p v-if="stale" role="alert" class="text-danger">
      Something changed since the preview. This is the new preview: check it and save again.
    </p>
    <p v-if="preview.isPending.value" role="status">Working out the suggestions…</p>
    <p v-else-if="preview.error.value" role="alert" class="text-danger">
      Could not preview: {{ preview.error.value.message }}
    </p>
    <template v-else-if="preview.data.value">
      <p v-if="preview.data.value.reference.length === 0">
        No published list names a federal category for each code yet, so there is nothing to suggest
        from.
      </p>
      <template v-else>
        <p>
          Suggestions come from {{ preview.data.value.reference.join(' and ') }}’s list, for
          {{ entriesText(preview.data.value.entries) }} of {{ stateName }} with ICD-10-CM codes.
        </p>
        <ul class="list-disc space-y-1 pl-5">
          <li>{{ entriesText(preview.data.value.gain) }} gain a suggestion.</li>
          <li>{{ entriesText(preview.data.value.change) }} get a different suggestion.</li>
          <li>{{ entriesText(preview.data.value.lose) }} lose their suggestion.</li>
          <li>{{ entriesText(preview.data.value.unchanged) }} keep the same suggestion.</li>
          <li v-if="preview.data.value.keptReviewed > 0">
            {{ entriesText(preview.data.value.keptReviewed) }} keep the suggestion an admin
            confirmed.
          </li>
        </ul>
        <div v-if="preview.data.value.byCategory.length > 0" class="overflow-x-auto">
          <table class="w-full max-w-xl border-collapse text-left text-sm">
            <caption class="text-left text-muted-foreground">
              Entries gaining or losing each federal category
            </caption>
            <thead class="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" class="py-1 pr-4 font-medium">Federal category</th>
                <th scope="col" class="py-1 pr-4 text-right font-medium">Gain</th>
                <th scope="col" class="py-1 text-right font-medium">Lose</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in preview.data.value.byCategory"
                :key="t.federalCategory"
                class="border-b border-border"
              >
                <th scope="row" class="py-1 pr-4 font-medium">{{ label(t.federalCategory) }}</th>
                <td class="py-1 pr-4 text-right">{{ n(t.gain) }}</td>
                <td class="py-1 text-right">{{ n(t.lose) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="preview.data.value.sample.length > 0" class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="text-left text-muted-foreground">
              {{
                preview.data.value.sample.length < changed
                  ? `${n(preview.data.value.sample.length)} of the ${n(changed)} entries that change`
                  : 'The entries that change'
              }}
            </caption>
            <thead class="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" class="py-1 pr-4 font-medium">Code</th>
                <th scope="col" class="py-1 pr-4 font-medium">State’s description</th>
                <th scope="col" class="py-1 pr-4 font-medium">Now</th>
                <th scope="col" class="py-1 font-medium">Suggested</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(e, j) in preview.data.value.sample"
                :key="j"
                class="border-b border-border"
              >
                <th scope="row" class="py-1 pr-4 font-mono font-medium">{{ e.code }}</th>
                <td class="py-1 pr-4">{{ e.description ?? '' }}</td>
                <td class="py-1 pr-4">
                  {{ e.before.length > 0 ? federalCategoriesText(e.before) : 'None' }}
                </td>
                <td class="py-1">
                  {{ e.after.length > 0 ? federalCategoriesText(e.after) : 'None' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
    <p v-if="save.error.value && !stale" role="alert" class="text-danger">
      Could not save: {{ save.error.value.message }}
    </p>
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="!preview.data.value || preview.isFetching.value || save.isPending.value"
        @click="confirm"
      >
        Save suggestions
      </button>
      <button type="button" :class="button" @click="emit('cancel')">Cancel</button>
    </div>
  </section>
</template>
