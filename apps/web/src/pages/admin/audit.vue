<script setup lang="ts">
import { auditListResponseSchema } from '@mfcd/shared'
import { useInfiniteQuery } from '@tanstack/vue-query'
import { computed } from 'vue'

import { getJson } from '../../lib/api'

const PAGE_SIZE = 50

const audit = useInfiniteQuery({
  queryKey: ['admin', 'audit'],
  queryFn: ({ pageParam }) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
    if (pageParam !== null) params.set('before', String(pageParam))
    return getJson(`/api/admin/audit?${params.toString()}`, auditListResponseSchema)
  },
  initialPageParam: null as number | null,
  getNextPageParam: (lastPage) => lastPage.nextBefore,
  // The log grows with every admin action; always show the latest when the page opens.
  staleTime: 0,
})

const entries = computed(() => audit.data.value?.pages.flatMap((page) => page.items) ?? [])

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <section class="space-y-4">
    <h2 class="font-display text-2xl font-medium text-heading">Audit log</h2>
    <p class="max-w-prose text-muted-foreground">
      Every admin action, newest first. Entries cannot be edited or deleted.
    </p>

    <p v-if="audit.isPending.value" class="text-muted-foreground">Loading…</p>
    <p
      v-else-if="audit.isError.value"
      role="alert"
      class="rounded border border-border bg-surface px-4 py-3 text-foreground"
    >
      Could not load the audit log. Reload the page to try again.
    </p>
    <p v-else-if="entries.length === 0" class="text-muted-foreground">No admin actions yet.</p>

    <div v-else class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          Audit log
        </caption>
        <thead class="border-b border-border text-muted-foreground">
          <tr>
            <th scope="col" class="py-2 pr-4 font-medium">When</th>
            <th scope="col" class="py-2 pr-4 font-medium">Who</th>
            <th scope="col" class="py-2 pr-4 font-medium">Action</th>
            <th scope="col" class="py-2 pr-4 font-medium">Target</th>
            <th scope="col" class="py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id" class="border-b border-border align-top">
            <td class="py-2 pr-4 whitespace-nowrap">
              <time :datetime="entry.at">{{ dateFormat.format(new Date(entry.at)) }}</time>
            </td>
            <td class="py-2 pr-4">{{ entry.actorEmail }}</td>
            <td class="py-2 pr-4 font-mono">{{ entry.action }}</td>
            <td class="py-2 pr-4 font-mono">{{ entry.target }}</td>
            <td class="py-2 font-mono text-xs break-all text-muted-foreground">
              {{ entry.details ? JSON.stringify(entry.details) : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <button
      v-if="audit.hasNextPage.value"
      type="button"
      class="rounded border border-border px-4 py-2 hover:bg-surface disabled:opacity-60"
      :disabled="audit.isFetchingNextPage.value"
      @click="audit.fetchNextPage()"
    >
      {{ audit.isFetchingNextPage.value ? 'Loading…' : 'Load older' }}
    </button>
  </section>
</template>
