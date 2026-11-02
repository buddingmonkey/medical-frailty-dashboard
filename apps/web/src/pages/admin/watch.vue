<script setup lang="ts">
import { groupWatchItems, type WatchCreate, watchItemSchema, type WatchUpdate } from '@mfcd/shared'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, ref } from 'vue'

import WatchCloseForm from '../../components/admin/WatchCloseForm.vue'
import WatchItemForm from '../../components/admin/WatchItemForm.vue'
import { formatIsoDate, localToday, useWatchItems, watchKindLabels } from '../../lib/admin-watch'
import { sendJson } from '../../lib/api'

type Tab = 'open' | 'history'
const tab = ref<Tab>('open')

const open = useWatchItems('open')
const closed = useWatchItems('closed', () => tab.value === 'history')

const groups = computed(() => {
  const g = groupWatchItems(open.data.value ?? [], localToday())
  return [
    { key: 'overdue', name: 'Overdue', items: g.overdue },
    { key: 'due-soon', name: 'Due within 14 days', items: g.dueSoon },
    { key: 'later', name: 'Later', items: g.later },
    { key: 'no-date', name: 'No date yet', items: g.noDate },
  ].filter((group) => group.items.length > 0)
})

/** null: no form; 'new': add form; a number: editing that item. */
const editing = ref<'new' | number | null>(null)
const closing = ref<number | null>(null)

const queryClient = useQueryClient()

const save = useMutation({
  mutationFn: ({ id, body }: { id: number | null; body: WatchCreate | WatchUpdate }) =>
    id === null
      ? sendJson('POST', '/api/admin/watch', body, watchItemSchema)
      : sendJson('PUT', `/api/admin/watch/${String(id)}`, body, watchItemSchema),
  onSuccess: async () => {
    editing.value = null
    closing.value = null
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  },
})

function onSave(fields: WatchCreate) {
  const id = editing.value === 'new' ? null : editing.value
  save.mutate({ id, body: id === null ? fields : { action: 'edit', ...fields } })
}

function onClose(id: number, status: 'done' | 'dismissed', resolutionMd: string) {
  save.mutate({ id, body: { action: 'close', status, resolutionMd } })
}

function startEdit(id: number | 'new') {
  save.reset()
  closing.value = null
  editing.value = id
}

function startClose(id: number) {
  save.reset()
  editing.value = null
  closing.value = id
}

const editingItem = computed(() =>
  typeof editing.value === 'number'
    ? open.data.value?.find((item) => item.id === editing.value)
    : undefined,
)

const resolvedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
</script>

<template>
  <section class="space-y-4">
    <h2 class="font-display text-2xl font-medium text-heading">Watch dates</h2>
    <p class="max-w-prose text-muted-foreground">
      Deadlines and re-check dates: court appeal windows, federal effective dates, state list
      re-checks. Closing an item needs a note and is recorded in the audit log.
    </p>

    <div role="tablist" aria-label="Watch items" class="flex gap-1 border-b border-border">
      <button
        v-for="t in ['open', 'history'] as const"
        :id="`watch-tab-${t}`"
        :key="t"
        type="button"
        role="tab"
        :aria-selected="tab === t"
        :aria-controls="`watch-panel-${t}`"
        class="-mb-px border-b-2 px-4 py-2"
        :class="
          tab === t
            ? 'border-primary font-medium text-heading'
            : 'border-transparent text-muted-foreground'
        "
        @click="tab = t"
      >
        {{ t === 'open' ? 'Open' : 'History' }}
      </button>
    </div>

    <p
      v-if="save.error.value"
      role="alert"
      class="rounded border border-border bg-surface px-4 py-3 text-foreground"
    >
      Could not save: {{ save.error.value.message }}
    </p>

    <div
      v-if="tab === 'open'"
      id="watch-panel-open"
      role="tabpanel"
      aria-labelledby="watch-tab-open"
      class="space-y-6"
    >
      <button
        v-if="editing !== 'new'"
        type="button"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover"
        @click="startEdit('new')"
      >
        Add an item
      </button>
      <WatchItemForm
        v-if="editing === 'new' || editingItem"
        :key="String(editing)"
        :item="editingItem"
        :saving="save.isPending.value"
        @save="onSave"
        @cancel="editing = null"
      />

      <p v-if="open.isPending.value" class="text-muted-foreground">Loading…</p>
      <p v-else-if="open.isError.value" role="alert" class="text-foreground">
        Could not load the watch items. Reload the page to try again.
      </p>
      <p v-else-if="groups.length === 0" class="text-muted-foreground">
        Nothing to watch right now.
      </p>

      <section
        v-for="group in groups"
        :key="group.key"
        :aria-labelledby="`watch-group-${group.key}`"
        class="space-y-3"
      >
        <h3 :id="`watch-group-${group.key}`" class="font-display text-xl font-medium text-heading">
          {{ group.name }}
        </h3>
        <article
          v-for="item in group.items"
          :key="item.id"
          class="rounded border border-border p-4"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h4 class="font-medium text-heading">{{ item.title }}</h4>
            <p class="text-sm text-muted-foreground">
              <template v-if="item.dueDate">
                <time :datetime="item.dueDate">{{ formatIsoDate(item.dueDate) }}</time>
                <template v-if="item.dateIsApproximate"> (approximate)</template>
                ·
              </template>
              {{ watchKindLabels[item.kind] }}
              <template v-if="item.stateId"> · {{ item.stateId }}</template>
              <template v-if="item.repeatDays">
                · repeats every {{ item.repeatDays }} days
              </template>
            </p>
          </div>
          <p class="mt-2 whitespace-pre-line text-foreground">{{ item.whyMd }}</p>
          <ul v-if="item.links.length > 0" class="mt-2 flex flex-wrap gap-x-4 text-sm">
            <li v-for="link in item.links" :key="link.url">
              <a :href="link.url" rel="noopener noreferrer" target="_blank">{{ link.label }}</a>
            </li>
          </ul>
          <div class="mt-3 flex gap-2 text-sm">
            <button
              type="button"
              class="rounded border border-border px-3 py-1 hover:bg-surface"
              :aria-label="`Edit ${item.title}`"
              @click="startEdit(item.id)"
            >
              Edit
            </button>
            <button
              type="button"
              class="rounded border border-border px-3 py-1 hover:bg-surface"
              :aria-label="`Close ${item.title}`"
              @click="startClose(item.id)"
            >
              Close
            </button>
          </div>
          <WatchCloseForm
            v-if="closing === item.id"
            :saving="save.isPending.value"
            @close="(status, note) => onClose(item.id, status, note)"
            @cancel="closing = null"
          />
        </article>
      </section>
    </div>

    <div
      v-else
      id="watch-panel-history"
      role="tabpanel"
      aria-labelledby="watch-tab-history"
      class="space-y-3"
    >
      <p v-if="closed.isPending.value" class="text-muted-foreground">Loading…</p>
      <p v-else-if="closed.isError.value" role="alert" class="text-foreground">
        Could not load the history. Reload the page to try again.
      </p>
      <p v-else-if="(closed.data.value ?? []).length === 0" class="text-muted-foreground">
        No closed items yet.
      </p>
      <article
        v-for="item in closed.data.value ?? []"
        :key="item.id"
        class="rounded border border-border p-4"
      >
        <h3 class="font-medium text-heading">{{ item.title }}</h3>
        <p class="text-sm text-muted-foreground">
          {{ item.status === 'done' ? 'Done' : 'Dismissed' }}
          <template v-if="item.resolvedAt">
            {{ resolvedFormat.format(new Date(item.resolvedAt)) }}
          </template>
          <template v-if="item.resolvedBy"> by {{ item.resolvedBy }}</template>
        </p>
        <p class="mt-2 whitespace-pre-line text-foreground">{{ item.resolutionMd }}</p>
      </article>
    </div>
  </section>
</template>
