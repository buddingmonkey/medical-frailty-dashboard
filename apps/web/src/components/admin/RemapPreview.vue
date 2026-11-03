<script setup lang="ts">
import {
  type FederalCategory,
  federalCategoriesText,
  federalCategoryInfo,
  icd10cmChapters,
  type RemapChange,
  type RemapChanges,
  remapChangeSentences,
  remapPreviewResponseSchema,
} from '@mfcd/shared'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { onMounted, ref, useId, useTemplateRef } from 'vue'
import { z } from 'zod'

import { ApiError, sendJson } from '../../lib/api'

// The confirm step of a bulk remap (roadmap M7 step 3): the server's preview of what the
// changes do to the state's published entries, then a save that sends the preview's token back.
// A 409 means something changed since: the preview is fetched again and the admin checks it.
const props = defineProps<{ stateId: string; stateName: string; changes: RemapChanges }>()
const emit = defineEmits<{ saved: [message: string]; cancel: [] }>()

const id = useId()
const heading = useTemplateRef<HTMLElement>('heading')
onMounted(() => heading.value?.focus())

const preview = useQuery({
  queryKey: ['admin', 'categories', props.stateId, 'remap-preview', props.changes],
  queryFn: () =>
    sendJson(
      'POST',
      `/api/admin/states/${props.stateId}/categories/preview`,
      props.changes,
      remapPreviewResponseSchema,
    ),
  gcTime: 0,
  staleTime: Infinity,
})

const stale = ref(false)
const count = props.changes.categories.length + props.changes.chapters.length
const save = useMutation({
  mutationFn: (token: string) =>
    sendJson(
      'POST',
      `/api/admin/states/${props.stateId}/categories/remap`,
      { ...props.changes, token },
      z.object({ ok: z.literal(true) }),
    ),
  onSuccess: () => {
    emit(
      'saved',
      `Remapped ${String(count)} ${count === 1 ? 'item' : 'items'} in ${props.stateName}.`,
    )
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

const label = (f: FederalCategory) => federalCategoryInfo[f].label
const n = (value: number) => value.toLocaleString('en-US')
function titleOf(change: RemapChange): string {
  if (change.kind === 'chapter') {
    const chapter = icd10cmChapters.find((c) => c.number === change.chapter)
    const to = change.to === null ? 'use the category mapping' : label(change.to)
    return `ICD-10-CM chapter ${String(change.chapter)}${chapter ? ` (${chapter.title})` : ''} → ${to}`
  }
  const name = [change.stateCategory || '(no category)', change.stateSubcategory]
    .filter(Boolean)
    .join(' / ')
  return `${name} → ${change.to === null ? '' : label(change.to)}`
}
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
      Check the remap before saving
    </h3>
    <p v-if="stale" role="alert" class="text-danger">
      Something changed since the preview. This is the new preview: check it and save again.
    </p>
    <p v-if="preview.isPending.value" role="status">Working out what changes…</p>
    <p v-else-if="preview.error.value" role="alert" class="text-danger">
      Could not preview: {{ preview.error.value.message }}
    </p>
    <template v-else-if="preview.data.value">
      <div
        v-for="(change, i) in preview.data.value.changes"
        :key="i"
        class="space-y-2 border-b border-border pb-4"
      >
        <h4 class="font-medium text-heading">{{ titleOf(change) }}</h4>
        <ul class="list-disc space-y-1 pl-5">
          <li v-for="line in remapChangeSentences(change)" :key="line">{{ line }}</li>
        </ul>
        <div v-if="change.sample.length > 0" class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="text-left text-muted-foreground">
              {{
                change.sample.length < change.movingTotal
                  ? `${n(change.sample.length)} of the ${n(change.movingTotal)} entries that move`
                  : 'The entries that move'
              }}
            </caption>
            <thead class="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" class="py-1 pr-4 font-medium">Code</th>
                <th scope="col" class="py-1 pr-4 font-medium">State’s description</th>
                <th scope="col" class="py-1 pr-4 font-medium">From</th>
                <th scope="col" class="py-1 font-medium">To</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(e, j) in change.sample" :key="j" class="border-b border-border">
                <th scope="row" class="py-1 pr-4 font-mono font-medium">{{ e.code }}</th>
                <td class="py-1 pr-4">{{ e.description ?? '' }}</td>
                <td class="py-1 pr-4">{{ federalCategoriesText(e.from) }}</td>
                <td class="py-1">{{ federalCategoriesText(e.to) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full max-w-xl border-collapse text-left text-sm">
          <caption class="text-left text-muted-foreground">
            Published entries of
            {{
              stateName
            }}
            per federal category (an entry placed in two counts under both)
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-1 pr-4 font-medium">Federal category</th>
              <th scope="col" class="py-1 pr-4 text-right font-medium">Before</th>
              <th scope="col" class="py-1 text-right font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in preview.data.value.totals"
              :key="t.federalCategory"
              class="border-b border-border"
            >
              <th scope="row" class="py-1 pr-4 font-medium">{{ label(t.federalCategory) }}</th>
              <td class="py-1 pr-4 text-right">{{ n(t.before) }}</td>
              <td class="py-1 text-right" :class="t.before !== t.after ? 'font-semibold' : ''">
                {{ n(t.after) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
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
        Save remap
      </button>
      <button type="button" :class="button" @click="emit('cancel')">Cancel</button>
    </div>
  </section>
</template>
