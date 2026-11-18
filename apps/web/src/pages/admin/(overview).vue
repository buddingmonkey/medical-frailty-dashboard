<script setup lang="ts">
import {
  draftListResponseSchema,
  groupWatchItems,
  launchReadinessResponseSchema,
} from '@mfcd/shared'
import { useQueries, useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { localToday, useWatchItems } from '../../lib/admin-watch'
import { getJson } from '../../lib/api'

// The status board uses existing endpoints only: launch readiness gives the states with a
// published list and their mapping counts; drafts are listed per state; watch items are open ones.
const readiness = useQuery({
  queryKey: ['admin', 'launch-readiness'],
  queryFn: () => getJson('/api/admin/launch-readiness', launchReadinessResponseSchema),
  staleTime: 0,
})
const states = computed(() => readiness.data.value?.states ?? [])

const drafts = useQueries({
  queries: computed(() =>
    states.value.map((s) => ({
      queryKey: ['admin', 'drafts', s.stateId],
      queryFn: async () =>
        (
          await getJson(
            `/api/admin/drafts?stateId=${encodeURIComponent(s.stateId)}`,
            draftListResponseSchema,
          )
        ).items,
    })),
  ),
})

const watch = useWatchItems('open')
const watchDue = computed(() => {
  const groups = groupWatchItems(watch.data.value ?? [], localToday())
  const due = new Map<string, number>()
  for (const item of [...groups.overdue, ...groups.dueSoon]) {
    if (item.stateId) due.set(item.stateId, (due.get(item.stateId) ?? 0) + 1)
  }
  return due
})

const rows = computed(() =>
  states.value.map((s, i) => {
    const draftQuery = drafts.value[i]
    return {
      ...s,
      draftsLoading: draftQuery?.isPending ?? true,
      draft: draftQuery?.data?.[0] ?? null,
      notApproved: s.unified.unmapped + s.unified.unconfirmed,
      federalToConfirm: s.federal.unmapped + s.federal.auto,
      watchDue: watchDue.value.get(s.stateId) ?? 0,
    }
  }),
)

const steps = [
  { to: '/admin/sources', label: 'Source files', what: 'Upload the state’s file.' },
  {
    to: '/admin/ingest',
    label: 'Read and map',
    what: 'Map the file’s columns and review its rows.',
  },
  { to: '/admin/drafts', label: 'Drafts', what: 'Check the draft and publish it.' },
  {
    to: '/admin/mappings',
    label: 'Mappings',
    what: 'Approve how the state’s categories map to unified categories.',
  },
  {
    to: '/admin/categories',
    label: 'Federal categories',
    what: 'Confirm the federal category of each state category.',
  },
] as const
</script>

<template>
  <section class="space-y-6">
    <h2 class="font-display text-2xl font-medium text-heading">Overview</h2>
    <p class="max-w-prose text-foreground">
      Every admin change is recorded in the <RouterLink to="/admin/audit">Audit log</RouterLink>.
      Nothing is public until a draft is published.
    </p>

    <div class="space-y-2">
      <h3 id="overview-steps" class="font-display text-xl font-medium text-heading">
        Add or update a state’s list
      </h3>
      <p class="max-w-prose text-foreground">
        Follow these steps in order. The <RouterLink to="/admin/guide">Guide</RouterLink> explains
        each one in detail.
      </p>
      <ol aria-label="Steps" class="list-decimal space-y-1 pl-6 text-foreground">
        <li v-for="step in steps" :key="step.to">
          <RouterLink :to="step.to">{{ step.label }}</RouterLink><span class="text-muted-foreground"
            >: {{ step.what }}</span
          >
        </li>
      </ol>
    </div>

    <div class="space-y-2">
      <h3 class="font-display text-xl font-medium text-heading">Status</h3>
      <p v-if="readiness.isPending.value" class="text-muted-foreground">Loading…</p>
      <p
        v-else-if="readiness.isError.value"
        role="alert"
        class="rounded border border-border bg-surface px-4 py-3 text-foreground"
      >
        The status could not be loaded. Reload the page to try again.
      </p>
      <p v-else-if="rows.length === 0" class="text-muted-foreground">
        No state has a published list yet.
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Status by state
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">State</th>
              <th scope="col" class="py-2 pr-4 font-medium">Public</th>
              <th scope="col" class="py-2 pr-4 font-medium">Open draft</th>
              <th scope="col" class="py-2 pr-4 font-medium">Mappings not approved</th>
              <th scope="col" class="py-2 pr-4 font-medium">Federal to confirm</th>
              <th scope="col" class="py-2 font-medium">Watch due</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.stateId" class="border-b border-border">
              <th scope="row" class="py-2 pr-4 font-medium text-heading">{{ r.name }}</th>
              <td class="py-2 pr-4 whitespace-nowrap">Version {{ r.versionNo }}</td>
              <td class="py-2 pr-4 whitespace-nowrap">
                <span v-if="r.draftsLoading" class="text-muted-foreground">…</span>
                <RouterLink v-else-if="r.draft" :to="`/admin/drafts/${String(r.draft.id)}`">
                  Version {{ r.draft.versionNo }}
                </RouterLink>
                <span v-else class="text-muted-foreground">None</span>
              </td>
              <td class="py-2 pr-4">
                <RouterLink v-if="r.notApproved > 0" to="/admin/mappings">
                  {{ r.notApproved }}
                </RouterLink>
                <template v-else>0</template>
              </td>
              <td class="py-2 pr-4">
                <RouterLink v-if="r.federalToConfirm > 0" to="/admin/categories">
                  {{ r.federalToConfirm }}
                </RouterLink>
                <template v-else>0</template>
              </td>
              <td class="py-2">
                <RouterLink v-if="r.watchDue > 0" to="/admin/watch">{{ r.watchDue }}</RouterLink>
                <template v-else>0</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
