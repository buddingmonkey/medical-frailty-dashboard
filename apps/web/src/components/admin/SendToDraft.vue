<script setup lang="ts">
import {
  DRAFT_CHUNK,
  type DraftSummary,
  draftListResponseSchema,
  draftSummarySchema,
  type ReviewResult,
  sourceListResponseSchema,
  toDraftEntries,
} from '@mfcd/shared'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { z } from 'zod'

import { getJson, sendJson } from '../../lib/api'

// Sends the reviewed rows to a draft version (docs/ingestion.md, step 6): pick the stored
// source document and a draft (new, or an open one: Georgia's A and B are one version), then
// the entries go up in chunks. Sending a source again starts it over on the server.
const props = defineProps<{
  stateId: string
  review: ReviewResult
  /** The table or sheet being sent ("Pages 2–294", "Sheet1"): re-sending it replaces only it. */
  part: string
  /** SHA-256 of the file read, to find its stored source; null for a pasted table. */
  sha256: string | null
  /** States the file names (findNamedStates), for the state-mismatch check. */
  namedStateIds: string[]
}>()

const id = useId()
const queryClient = useQueryClient()

const sourcesQuery = useQuery({
  queryKey: computed(() => ['admin', 'sources', props.stateId]),
  queryFn: async () =>
    (
      await getJson(
        `/api/admin/sources?${new URLSearchParams({ stateId: props.stateId }).toString()}`,
        sourceListResponseSchema,
      )
    ).items,
})
const draftsQuery = useQuery({
  queryKey: computed(() => ['admin', 'drafts', props.stateId]),
  queryFn: async () =>
    (
      await getJson(
        `/api/admin/drafts?${new URLSearchParams({ stateId: props.stateId }).toString()}`,
        draftListResponseSchema,
      )
    ).items,
})

const sources = computed(() => sourcesQuery.data.value ?? [])
const matched = computed(() =>
  props.sha256 === null ? undefined : sources.value.find((s) => s.sha256 === props.sha256),
)
const sourceId = ref<number | ''>('')
watch(
  [matched, () => props.sha256],
  ([source]) => {
    sourceId.value = source?.id ?? ''
  },
  { immediate: true },
)

/** A draft this panel made; kept so a retry goes to the same draft. */
const created = ref<DraftSummary | null>(null)
const drafts = computed(() => {
  const list = draftsQuery.data.value ?? []
  const own = created.value
  return own && !list.some((d) => d.id === own.id) ? [own, ...list] : list
})
const draftChoice = ref<number | 'new'>('new')
watch(
  () => props.stateId,
  () => {
    created.value = null
    draftChoice.value = 'new'
  },
)

const payload = computed(() => toDraftEntries(props.review))
const counts = computed(() => {
  let sent = 0
  let dropped = 0
  let flagged = 0
  for (const r of props.review.rows) {
    if (r.dropped) dropped++
    else if (r.status !== 'problem') {
      sent++
      if (r.openFlags.length > 0) flagged++
    }
  }
  return { sent, dropped, flagged }
})

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

// --- Sending ----------------------------------------------------------------------------------
const sending = ref(false)
const progress = ref(0)
const error = ref<string | null>(null)
const done = ref<DraftSummary | null>(null)

// New rows or a new source: the earlier result no longer applies.
watch([() => props.review, sourceId, draftChoice], () => {
  done.value = null
})

const ok = z.object({ ok: z.literal(true) })

async function send() {
  if (sourceId.value === '') return
  sending.value = true
  error.value = null
  done.value = null
  progress.value = 0
  const { entries, invalidRowCount } = payload.value
  try {
    let draft: DraftSummary | undefined =
      draftChoice.value === 'new' ? undefined : drafts.value.find((d) => d.id === draftChoice.value)
    if (!draft) {
      const res = await sendJson(
        'POST',
        '/api/admin/drafts',
        { stateId: props.stateId },
        z.object({ item: draftSummarySchema }),
      )
      draft = res.item
      created.value = draft
      draftChoice.value = draft.id
    }
    const base = `/api/admin/drafts/${String(draft.id)}`
    await sendJson(
      'PUT',
      `${base}/sources/${String(sourceId.value)}`,
      {
        part: props.part,
        expectedEntries: entries.length,
        invalidRowCount,
        namedStateIds: props.namedStateIds,
      },
      ok,
    )
    for (let i = 0; i < entries.length; i += DRAFT_CHUNK) {
      await sendJson(
        'POST',
        `${base}/rows`,
        {
          sourceDocumentId: sourceId.value,
          part: props.part,
          entries: entries.slice(i, i + DRAFT_CHUNK),
        },
        z.object({ ok: z.literal(true) }),
      )
      progress.value = Math.min(i + DRAFT_CHUNK, entries.length)
    }
    done.value = draft
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    sending.value = false
    await queryClient.invalidateQueries({ queryKey: ['admin', 'drafts', props.stateId] })
  }
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
</script>

<template>
  <section
    class="max-w-3xl space-y-4 rounded border border-border p-4"
    :aria-labelledby="`${id}-t`"
  >
    <h3 :id="`${id}-t`" class="font-display text-xl font-medium text-heading">Send to a draft</h3>
    <p class="text-foreground">
      {{ plural(payload.entries.length, 'entry', 'entries') }} from
      {{ plural(counts.sent, 'row', 'rows') }}.
      <template v-if="review.summary.problems > 0">
        {{ plural(review.summary.problems, 'row cannot be read', 'rows cannot be read') }} and
        {{ review.summary.problems === 1 ? 'counts' : 'count' }} as invalid (publishing is blocked
        above 2%).
      </template>
      <template v-if="counts.dropped > 0">
        {{ plural(counts.dropped, 'dropped row is', 'dropped rows are') }} left out.
      </template>
      <template v-if="counts.flagged > 0">
        {{ plural(counts.flagged, 'row still has', 'rows still have') }} open questions; the checks
        will ask about them.
      </template>
    </p>

    <p v-if="namedStateIds.length > 0" class="text-sm text-muted-foreground">
      States named in the file: {{ namedStateIds.join(', ') }}. The checks ask for the state code if
      one of them is not {{ stateId }}.
    </p>

    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label :for="`${id}-source`" class="font-medium">Source document</label>
        <select :id="`${id}-source`" v-model="sourceId" :class="inputClass">
          <option value="" disabled>Choose a stored file</option>
          <option v-for="s in sources" :key="s.id" :value="s.id">
            {{ s.title }}{{ s.id === matched?.id ? ' (this file)' : '' }}
          </option>
        </select>
        <p v-if="sha256 !== null && sourcesQuery.isSuccess.value && !matched" class="mt-1 text-sm">
          This file is not stored yet. Store it on
          <RouterLink to="/admin/sources" class="text-link underline">Source files</RouterLink>
          first: its title, address and date become the citation.
        </p>
      </div>
      <div>
        <label :for="`${id}-draft`" class="font-medium">Draft</label>
        <select :id="`${id}-draft`" v-model="draftChoice" :class="inputClass">
          <option value="new">New draft</option>
          <option v-for="d in drafts" :key="d.id" :value="d.id">
            Draft v{{ d.versionNo }} ({{ plural(d.rowCount, 'row', 'rows') }})
          </option>
        </select>
        <p class="mt-1 text-sm text-muted-foreground">
          Add to an open draft when a state publishes its list in several files or tables. Sending
          the same table again replaces its rows.
        </p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="sourceId === '' || sending || payload.entries.length === 0"
        @click="send"
      >
        Send to draft
      </button>
      <p v-if="sending" role="status">
        Sent {{ progress.toLocaleString('en-US') }} of
        {{ payload.entries.length.toLocaleString('en-US') }} entries…
      </p>
      <p v-if="done" role="status">
        Sent.
        <RouterLink :to="`/admin/drafts/${done.id}`" class="text-link underline"
          >Open draft v{{ done.versionNo }}</RouterLink
        >
        to see the checks.
      </p>
    </div>
    <p v-if="error" role="alert" class="text-danger">
      Could not send the rows: {{ error }}. Send again to start this file over.
    </p>
  </section>
</template>
