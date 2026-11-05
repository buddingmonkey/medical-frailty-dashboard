<script setup lang="ts">
import {
  DRAFT_EXPIRY_DAYS,
  KEEP_MANUAL_DUMPS,
  KEEP_PUBLISH_BACKUPS,
  KEEP_WEEKLY_DUMPS,
  maintenancePartLabels,
  maintenanceParts,
  maintenanceRunSchema,
  maintenanceStatusSchema,
} from '@mfcd/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

import { getJson, sendJson } from '../../lib/api'

// Weekly maintenance (docs/deployment.md, "Backups and restore"): the last run, the weekly dumps
// in R2, and a button that runs it now. The downloads are plain links (Access cookie).

const queryClient = useQueryClient()

const status = useQuery({
  queryKey: ['admin', 'maintenance'],
  queryFn: () => getJson('/api/admin/maintenance', maintenanceStatusSchema),
  staleTime: 0,
})

const run = useMutation({
  mutationFn: () => sendJson('POST', '/api/admin/maintenance', {}, maintenanceRunSchema),
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  },
})

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const when = (iso: string) => dateFormat.format(new Date(iso))

const countWords: Record<string, string> = {
  rows: 'rows',
  zipBytes: 'bytes zipped',
  deleted: 'deleted',
  kept: 'kept',
  states: 'states',
  draftsDeleted: 'drafts deleted',
  discardedEmptied: 'discarded drafts emptied',
  entriesDeleted: 'entries deleted',
  sourcesDeleted: 'sources deleted',
  left: 'left for next week',
}
// Shown in this order; others (rowsRead, queries, jsonChars) are for the logs.
const shown = Object.keys(countWords)

function summary(counts: Record<string, number>): string {
  return shown
    .filter((key) => counts[key] !== undefined)
    .map((key) => `${(counts[key] ?? 0).toLocaleString('en-US')} ${countWords[key] ?? key}`)
    .join(', ')
}

function size(bytes: number): string {
  if (bytes < 1000) return `${String(bytes)} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
</script>

<template>
  <div class="max-w-3xl space-y-4 rounded border border-border p-4">
    <h3 class="font-display text-xl font-medium text-heading">Maintenance</h3>
    <p class="text-foreground">
      Every Sunday at 07:00 UTC the site saves a full backup, removes old backups and cleans up old
      drafts. It keeps the newest {{ KEEP_WEEKLY_DUMPS }} Sunday backups, the newest
      {{ KEEP_MANUAL_DUMPS }} backups made with Run maintenance now, and the newest
      {{ KEEP_PUBLISH_BACKUPS }} backups of each state saved before a publish.
    </p>

    <p v-if="status.isPending.value" class="text-muted-foreground">Loading…</p>
    <p
      v-else-if="status.isError.value"
      role="alert"
      class="rounded border border-border bg-surface px-4 py-3 text-foreground"
    >
      Could not load the maintenance status. Reload the page to try again.
    </p>
    <template v-else-if="status.data.value">
      <div class="space-y-2">
        <h4 class="font-medium text-heading">Last run</h4>
        <p v-if="!status.data.value.last" class="text-muted-foreground">
          Maintenance has not run yet.
        </p>
        <template v-else>
          <p class="text-foreground">
            {{ status.data.value.last.trigger === 'cron' ? 'Scheduled run' : 'Run by hand' }},
            {{ when(status.data.value.last.startedAt) }}
          </p>
          <ul aria-label="Last run, part by part" class="space-y-1 text-sm">
            <li v-for="part in maintenanceParts" :key="part">
              <span class="font-medium">{{ maintenancePartLabels[part] }}:</span>
              <template v-if="status.data.value.last.parts[part].status === 'ok'">
                OK<template v-if="summary(status.data.value.last.parts[part].counts)"
                  >, {{ summary(status.data.value.last.parts[part].counts) }}</template
                >
              </template>
              <span v-else class="text-danger"
                >Failed: {{ status.data.value.last.parts[part].error }}</span
              >
            </li>
          </ul>
        </template>
      </div>

      <div class="space-y-2">
        <h4 class="font-medium text-heading">Saved backups</h4>
        <p class="text-sm text-muted-foreground">
          Sunday backups and those made with Run maintenance now, newest first. Each is the same zip
          as Download backup, plus where each source file is stored, so a developer can rebuild the
          whole database from it. Like the download, it holds admin email addresses: keep it
          private.
        </p>
        <p v-if="status.data.value.weekly.length === 0" class="text-muted-foreground">
          No saved backups yet.
        </p>
        <table v-else class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Saved backups
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">Date (UTC)</th>
              <th scope="col" class="py-2 pr-4 font-medium">Size</th>
              <th scope="col" class="py-2 font-medium"><span class="sr-only">Download</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="dump in status.data.value.weekly"
              :key="dump.date"
              class="border-b border-border"
            >
              <td class="py-2 pr-4">{{ dump.date }}</td>
              <td class="py-2 pr-4">{{ size(dump.size) }}</td>
              <td class="py-2">
                <a
                  :href="`/api/admin/backup/weekly/${dump.date}`"
                  download
                  :aria-label="`Download the backup of ${dump.date}`"
                  >Download</a
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div class="space-y-2 rounded border border-border bg-surface p-3">
      <p class="text-foreground">
        <strong>Run maintenance now</strong> does the same as the Sunday run: it saves a backup,
        removes the old backups listed above, deletes open drafts with no activity for
        {{ DRAFT_EXPIRY_DAYS }} days (and their source files, when no other version uses them), and
        empties drafts discarded more than {{ DRAFT_EXPIRY_DAYS }} days ago. Published and earlier
        versions are never touched. A backup replaces any earlier one from the same day (UTC).
      </p>
      <button
        type="button"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="run.isPending.value"
        @click="run.mutate()"
      >
        {{ run.isPending.value ? 'Running…' : 'Run maintenance now' }}
      </button>
      <p v-if="run.isError.value" role="alert" class="text-danger">
        Maintenance did not run: {{ run.error.value?.message }}
      </p>
    </div>
  </div>
</template>
