<script setup lang="ts">
import {
  type BackupBundle,
  BackupError,
  DRAFT_CHUNK,
  type DraftSummary,
  diffMappings,
  draftSummarySchema,
  MAX_BACKUP_BYTES,
  parseBackup,
  readBackupBytes,
  restoreMappingsSchema,
  restorePlan,
  restoreSourceResponseSchema,
  restoredFileType,
  stateListResponseSchema,
} from '@mfcd/shared'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { z } from 'zod'

import { formatTimestampDate } from '../../lib/admin-watch'
import { getJson, sendJson } from '../../lib/api'

// Restore path 2 (docs/deployment.md, "Backups and restore"): read a backup in the browser (the
// full download's .zip, or a per-publish .json from R2), pick one state and one version, and
// send its entries to a NEW draft through the normal draft API. The draft then goes through the
// checks and publish like any other; nothing here touches the public list.
const id = useId()
const queryClient = useQueryClient()

const statesQuery = useQuery({
  queryKey: ['admin', 'states'],
  queryFn: async () => (await getJson('/api/admin/states', stateListResponseSchema)).items,
  staleTime: Infinity,
})
const siteStates = computed(
  () => new Map((statesQuery.data.value ?? []).map((s) => [s.id, s.name])),
)

const fileName = ref('')
const bundle = ref<BackupBundle | null>(null)
const readError = ref<string | null>(null)
const reading = ref(false)

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  bundle.value = null
  readError.value = null
  done.value = null
  if (!file) return
  fileName.value = file.name
  if (file.size > MAX_BACKUP_BYTES) {
    readError.value = `${file.name} is ${mb(file.size)}; the limit is ${mb(MAX_BACKUP_BYTES)}. Use restore path 3 (docs/deployment.md).`
    return
  }
  reading.value = true
  try {
    bundle.value = parseBackup(readBackupBytes(new Uint8Array(await file.arrayBuffer())))
  } catch (err) {
    readError.value =
      err instanceof BackupError ? err.message : 'Could not read the file as a backup.'
  } finally {
    reading.value = false
  }
}

/** Format 1 files know only the state id; this site's list has the name. */
function nameOf(stateId: string): string {
  const fromFile = bundle.value?.stateNames[stateId]
  return fromFile && fromFile !== stateId ? fromFile : (siteStates.value.get(stateId) ?? stateId)
}

/** States in the file, each with its versions (newest first). */
const statesInFile = computed(() => {
  const by = new Map<string, BackupBundle['versions']>()
  for (const v of bundle.value?.versions ?? []) {
    const list = by.get(v.version.stateId)
    if (list) list.push(v)
    else by.set(v.version.stateId, [v])
  }
  return [...by.entries()].map(([stateId, versions]) => ({ stateId, versions }))
})
const totalEntries = computed(() =>
  (bundle.value?.versions ?? []).reduce((n, v) => n + v.entries.length, 0),
)

const stateId = ref('')
const versionId = ref<number | ''>('')
watch(bundle, (b) => {
  stateId.value = b?.versions.length === 1 ? (b.versions[0]?.version.stateId ?? '') : ''
})
const versionsOfState = computed(
  () => statesInFile.value.find((s) => s.stateId === stateId.value)?.versions ?? [],
)
watch(versionsOfState, (list) => {
  // The one that was public when the backup was written, else the newest.
  const pick = list.find((v) => v.version.status === 'published') ?? list[0]
  versionId.value = pick?.version.id ?? ''
})
const chosen = computed(() => versionsOfState.value.find((v) => v.version.id === versionId.value))
const plan = computed(() => (chosen.value ? restorePlan(chosen.value) : null))
const onSite = computed(() => stateId.value !== '' && siteStates.value.has(stateId.value))

// --- Mappings (full backups only, and only when ticked) ---------------------------------------
const restoreMappings = ref(false)
watch([stateId, bundle], () => {
  restoreMappings.value = false
})
const fileMappings = computed(() => bundle.value?.mappings?.[stateId.value] ?? null)
const currentMappings = useQuery({
  queryKey: computed(() => ['admin', 'backup-mappings', stateId.value]),
  queryFn: () =>
    getJson(
      `/api/admin/backup/mappings?${new URLSearchParams({ stateId: stateId.value }).toString()}`,
      restoreMappingsSchema,
    ),
  enabled: computed(() => restoreMappings.value && onSite.value),
})
const mappingDiff = computed(() =>
  fileMappings.value && currentMappings.data.value
    ? diffMappings(currentMappings.data.value, fileMappings.value)
    : null,
)
const diffLabels = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const
const short = (text: string | null) =>
  text === null ? '' : text.length > 80 ? `${text.slice(0, 80)}…` : text

// --- Sending ----------------------------------------------------------------------------------
const sending = ref(false)
const progress = ref('')
const sendError = ref<string | null>(null)
const done = ref<{
  draft: DraftSummary
  entries: number
  reused: number
  created: number
  mappings: boolean
} | null>(null)
watch([bundle, versionId], () => {
  done.value = null
  sendError.value = null
})

const canSend = computed(
  () =>
    plan.value !== null &&
    plan.value.problems.length === 0 &&
    plan.value.parts.length > 0 &&
    onSite.value &&
    !sending.value &&
    (!restoreMappings.value || mappingDiff.value !== null),
)

const ok = z.object({ ok: z.literal(true) })

async function send() {
  const p = plan.value
  const file = bundle.value
  if (!p || !file || !canSend.value) return
  sending.value = true
  sendError.value = null
  progress.value = 'Matching source documents…'
  try {
    // 1. The sources the version cites: this site's file with the same SHA-256, or metadata only.
    const sourceMap = new Map<number, number>()
    let reused = 0
    let created = 0
    const cited = new Set(p.parts.map((part) => part.backupSourceId))
    for (const source of p.sources.filter((s) => cited.has(s.id))) {
      const res = await sendJson(
        'POST',
        '/api/admin/backup/sources',
        {
          stateId: p.stateId,
          title: source.title.slice(0, 200) || 'Restored source',
          url: source.url,
          publisherDate: source.publisherDate,
          fileType: restoredFileType(source),
          sha256: source.sha256,
          byteSize: source.byteSize ?? null,
        },
        restoreSourceResponseSchema,
      )
      sourceMap.set(source.id, res.sourceDocumentId)
      if (res.reused) reused++
      else created++
    }

    // 2. A new draft, which says in the audit log which backup it came from.
    const { item: draft } = await sendJson(
      'POST',
      '/api/admin/drafts',
      {
        stateId: p.stateId,
        label: `Restored from backup of ${file.writtenAt.slice(0, 10)} (v${String(p.versionNo)})`,
        fromBackup: {
          writtenAt: file.writtenAt,
          environment: file.environment,
          versionNo: p.versionNo,
          format: file.format,
        },
      },
      z.object({ item: draftSummarySchema }),
    )

    // 3. Each part, then its entries in chunks, as the ingest screen sends them.
    const base = `/api/admin/drafts/${String(draft.id)}`
    let sent = 0
    for (const part of p.parts) {
      const sourceDocumentId = sourceMap.get(part.backupSourceId)
      if (sourceDocumentId === undefined) throw new Error('A source could not be matched.')
      await sendJson(
        'PUT',
        `${base}/sources/${String(sourceDocumentId)}`,
        {
          part: part.part,
          expectedEntries: part.entries.length,
          invalidRowCount: part.invalidRowCount,
          namedStateIds: part.namedStateIds,
        },
        ok,
      )
      for (let i = 0; i < part.entries.length; i += DRAFT_CHUNK) {
        const entries = part.entries.slice(i, i + DRAFT_CHUNK)
        await sendJson('POST', `${base}/rows`, { sourceDocumentId, part: part.part, entries }, ok)
        sent += entries.length
        progress.value = `Sent ${sent.toLocaleString('en-US')} of ${p.entryCount.toLocaleString('en-US')} entries…`
      }
    }

    // 4. Mappings, only when asked.
    const fromFile = restoreMappings.value ? fileMappings.value : null
    const mappings = fromFile !== null
    if (fromFile) {
      progress.value = 'Restoring mappings…'
      await sendJson('PUT', `/api/admin/backup/mappings/${p.stateId}`, fromFile, ok)
    }
    done.value = { draft, entries: sent, reused, created, mappings }
    progress.value = ''
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  } catch (err) {
    sendError.value = err instanceof Error ? err.message : 'Could not create the draft.'
    progress.value = ''
  } finally {
    sending.value = false
  }
}

const n = (value: number) => value.toLocaleString('en-US')
const inputClass = 'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5'
const statusLabels: Record<string, string> = {
  draft: 'draft',
  published: 'public then',
  superseded: 'earlier',
  discarded: 'discarded',
}
</script>

<template>
  <section
    :aria-labelledby="`${id}-t`"
    class="max-w-3xl space-y-4 rounded border border-border p-4"
  >
    <h3 :id="`${id}-t`" class="font-display text-xl font-medium text-heading">
      Restore a state from a backup
    </h3>
    <p class="text-foreground">
      Pick a backup: the full download (<code>.zip</code>) or a per-publish backup from R2
      (<code>.json</code>). The file is read here, in your browser. One version of one state becomes
      a <strong>new draft</strong>; you then run its checks and publish it as usual.
    </p>
    <div>
      <label :for="`${id}-file`" class="font-medium">Backup file</label>
      <input
        :id="`${id}-file`"
        type="file"
        accept=".zip,.json,application/zip,application/json"
        :class="inputClass"
        @change="onFile"
      />
      <p class="mt-1 text-sm text-muted-foreground">Up to {{ mb(MAX_BACKUP_BYTES) }}.</p>
    </div>
    <p v-if="reading" role="status">Reading {{ fileName }}…</p>
    <p v-if="readError" role="alert" class="text-danger">{{ readError }}</p>

    <template v-if="bundle">
      <section :aria-labelledby="`${id}-in`" class="space-y-2">
        <h4 :id="`${id}-in`" class="font-medium text-heading">What is in {{ fileName }}</h4>
        <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="text-muted-foreground">Kind</dt>
          <dd>
            {{
              bundle.format === 2
                ? 'Full backup (format 2)'
                : 'One version, before a publish (format 1)'
            }}
          </dd>
          <dt class="text-muted-foreground">Written</dt>
          <dd>{{ formatTimestampDate(bundle.writtenAt) }} ({{ bundle.writtenAt }})</dd>
          <template v-if="bundle.environment">
            <dt class="text-muted-foreground">Environment</dt>
            <dd>{{ bundle.environment }}</dd>
          </template>
          <template v-if="bundle.migration">
            <dt class="text-muted-foreground">Database migration</dt>
            <dd>{{ bundle.migration }}</dd>
          </template>
          <dt class="text-muted-foreground">Holds</dt>
          <dd>
            {{ n(statesInFile.length) }} {{ statesInFile.length === 1 ? 'state' : 'states' }},
            {{ n(bundle.versions.length) }}
            {{ bundle.versions.length === 1 ? 'version' : 'versions' }},
            {{ n(totalEntries) }} entries
          </dd>
        </dl>
      </section>

      <p v-if="statesInFile.length === 0" class="text-muted-foreground">
        This backup holds no versions.
      </p>
      <div v-else class="grid gap-4 md:grid-cols-2">
        <div>
          <label :for="`${id}-state`" class="font-medium">State</label>
          <select :id="`${id}-state`" v-model="stateId" :class="inputClass">
            <option value="" disabled>Choose a state</option>
            <option v-for="s in statesInFile" :key="s.stateId" :value="s.stateId">
              {{ nameOf(s.stateId) }} ({{ s.versions.length }})
            </option>
          </select>
        </div>
        <div v-if="stateId">
          <label :for="`${id}-version`" class="font-medium">Version</label>
          <select :id="`${id}-version`" v-model="versionId" :class="inputClass">
            <option v-for="v in versionsOfState" :key="v.version.id" :value="v.version.id">
              v{{ v.version.versionNo }}, {{ statusLabels[v.version.status] ?? v.version.status }},
              {{ n(v.entries.length) }} entries
            </option>
          </select>
        </div>
      </div>

      <p v-if="stateId && statesQuery.isSuccess.value && !onSite" role="alert" class="text-danger">
        This site has no state {{ stateId }}; it cannot take this version.
      </p>

      <template v-if="plan && chosen">
        <p>
          v{{ plan.versionNo }} of {{ nameOf(plan.stateId) }}: {{ n(plan.entryCount) }} entries in
          {{ plan.parts.length }} {{ plan.parts.length === 1 ? 'part' : 'parts' }}, citing
          {{ plan.sources.length }} source
          {{ plan.sources.length === 1 ? 'document' : 'documents' }}.
          <template v-if="chosen.version.publishedAt">
            Published {{ formatTimestampDate(chosen.version.publishedAt) }}.
          </template>
        </p>
        <ul class="list-disc pl-6 text-sm" aria-label="Source documents in this version">
          <li v-for="s in plan.sources" :key="s.id">
            {{ s.title }}<template v-if="s.publisherDate"> ({{ s.publisherDate }})</template>
          </li>
        </ul>
        <p class="text-sm text-muted-foreground">
          A source this site still has (same SHA-256) is reused. Otherwise its title, link and date
          are stored without the file, marked “restored from backup, file not available”.
        </p>
        <div v-if="plan.problems.length > 0" role="alert" class="space-y-1 text-danger">
          <p class="font-medium">These entries would not pass the draft checks:</p>
          <ul class="list-disc pl-6 text-sm">
            <li v-for="problem in plan.problems" :key="problem">{{ problem }}</li>
          </ul>
        </div>

        <div v-if="fileMappings" class="space-y-2">
          <label class="flex items-start gap-2">
            <input v-model="restoreMappings" type="checkbox" class="mt-1" />
            <span>
              Also replace {{ nameOf(plan.stateId) }}’s category mappings, chapter overrides and
              column profiles with the backup’s
              <span class="text-muted-foreground">(default: keep the current ones)</span>
            </span>
          </label>
          <template v-if="restoreMappings">
            <p v-if="currentMappings.isPending.value" role="status">Loading current mappings…</p>
            <p v-else-if="currentMappings.error.value" role="alert" class="text-danger">
              Could not load the current mappings: {{ currentMappings.error.value.message }}
            </p>
            <p v-else-if="mappingDiff?.length === 0">
              The backup’s mappings are the same as the current ones.
            </p>
            <div v-else-if="mappingDiff" class="overflow-x-auto">
              <table class="w-full border-collapse text-left text-sm">
                <caption class="sr-only">
                  Mapping changes
                </caption>
                <thead class="border-b border-border text-muted-foreground">
                  <tr>
                    <th scope="col" class="py-2 pr-4 font-medium">Change</th>
                    <th scope="col" class="py-2 pr-4 font-medium">What</th>
                    <th scope="col" class="py-2 pr-4 font-medium">Now</th>
                    <th scope="col" class="py-2 font-medium">From the backup</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="line in mappingDiff"
                    :key="`${line.kind}${line.what}`"
                    class="border-b border-border align-top"
                  >
                    <td class="py-2 pr-4">{{ diffLabels[line.kind] }}</td>
                    <td class="py-2 pr-4">{{ line.what }}</td>
                    <td class="py-2 pr-4">{{ short(line.before) }}</td>
                    <td class="py-2">{{ short(line.after) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <button
          type="button"
          class="rounded bg-primary px-4 py-2 text-on-primary disabled:opacity-60"
          :disabled="!canSend"
          @click="send"
        >
          Create draft from v{{ plan.versionNo }}
        </button>
      </template>

      <p v-if="progress" role="status">{{ progress }}</p>
      <p v-if="sendError" role="alert" class="text-danger">
        Could not create the draft: {{ sendError }}
      </p>
      <div v-if="done" role="status" class="space-y-1">
        <p class="font-medium">
          Draft v{{ done.draft.versionNo }} holds {{ n(done.entries) }} restored entries.
          <template v-if="done.mappings">Mappings restored.</template>
        </p>
        <p class="text-sm">
          Sources: {{ done.reused }} reused, {{ done.created }} stored without the file. Next: open
          the draft, run its checks and publish it.
        </p>
        <RouterLink :to="`/admin/drafts/${done.draft.id}`" class="text-link underline"
          >Open draft v{{ done.draft.versionNo }}</RouterLink
        >
      </div>
    </template>
  </section>
</template>
