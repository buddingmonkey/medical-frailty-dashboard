<script setup lang="ts">
import {
  fileTypeFromName,
  MAX_SOURCE_BYTES,
  type SourceDocument,
  type SourceFileType,
  sha256Hex,
  sourceListResponseSchema,
  sourceUploadResponseSchema,
  stateListResponseSchema,
} from '@mfcd/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, ref, useId, watch } from 'vue'

import { formatIsoDate, formatTimestampDate } from '../../lib/admin-watch'
import { apiRequest, getJson } from '../../lib/api'

const id = useId()
const queryClient = useQueryClient()

const statesQuery = useQuery({
  queryKey: ['admin', 'states'],
  queryFn: async () => (await getJson('/api/admin/states', stateListResponseSchema)).items,
  staleTime: Infinity,
})

const stateId = ref('')
const stateName = computed(
  () => statesQuery.data.value?.find((s) => s.id === stateId.value)?.name ?? '',
)

const sourcesQuery = useQuery({
  queryKey: ['admin', 'sources', stateId],
  queryFn: async () =>
    (
      await getJson(
        `/api/admin/sources?${new URLSearchParams({ stateId: stateId.value }).toString()}`,
        sourceListResponseSchema,
      )
    ).items,
  enabled: () => stateId.value !== '',
})

// The chosen file, read and hashed in the browser before anything is sent.
interface Picked {
  name: string
  type: SourceFileType
  bytes: Uint8Array<ArrayBuffer>
  sha256: string
  /** Same file already stored for this state. */
  duplicate: SourceDocument | null
}
const picked = ref<Picked | null>(null)
const fileProblem = ref<string | null>(null)
const checking = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const title = ref('')
const url = ref('')
const publisherDate = ref('')
const done = ref<string | null>(null)

function resetFile() {
  picked.value = null
  fileProblem.value = null
  done.value = null
  if (fileInput.value) fileInput.value.value = ''
}

// A duplicate check is only true for the state it ran against.
watch(stateId, resetFile)

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  picked.value = null
  fileProblem.value = null
  done.value = null
  upload.reset()
  if (!file) return

  const type = fileTypeFromName(file.name)
  if (type === null) {
    fileProblem.value = 'Use a PDF, Excel (.xlsx), CSV, JSON or text file.'
    return
  }
  if (file.size > MAX_SOURCE_BYTES) {
    fileProblem.value = 'This file is over 25 MB, the limit for source files.'
    return
  }

  checking.value = true
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const sha256 = await sha256Hex(bytes)
    const params = new URLSearchParams({ stateId: stateId.value, sha256 })
    const { items } = await getJson(
      `/api/admin/sources?${params.toString()}`,
      sourceListResponseSchema,
    )
    picked.value = { name: file.name, type, bytes, sha256, duplicate: items[0] ?? null }
    title.value = file.name.slice(0, file.name.lastIndexOf('.'))
  } catch {
    fileProblem.value = 'Could not read or check this file. Try again.'
  } finally {
    checking.value = false
  }
}

const upload = useMutation({
  mutationFn: (file: Picked) => {
    const params = new URLSearchParams({
      stateId: stateId.value,
      title: title.value,
      fileType: file.type,
      sha256: file.sha256,
      url: url.value.trim(),
      publisherDate: publisherDate.value,
    })
    return apiRequest(`/api/admin/sources?${params.toString()}`, sourceUploadResponseSchema, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file.bytes,
    })
  },
  onSuccess: async ({ source, duplicate }) => {
    resetFile()
    title.value = ''
    url.value = ''
    publisherDate.value = ''
    done.value = duplicate
      ? `Already stored as “${source.title}”. Nothing new was saved.`
      : `Stored “${source.title}”.`
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  },
})

function versionText(source: SourceDocument): string {
  return source.versions.map((v) => `v${String(v.versionNo)} (${v.status})`).join(', ')
}

function duplicateText(source: SourceDocument): string {
  const when = formatTimestampDate(source.retrievedAt)
  const versions = source.versions.map((v) => String(v.versionNo)).join(', ')
  return `This file was already loaded on ${when} ${
    versions === '' ? '(not in any version yet)' : `as version ${versions}`
  }, titled “${source.title}”. There is nothing new to upload; use the stored copy.`
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${String(Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Source files</h2>
      <p class="max-w-prose text-muted-foreground">
        Store the state's original file, unchanged, as evidence. The file is hashed in your browser
        first, so a file that is already stored is caught before it is sent.
      </p>
    </div>

    <div class="max-w-xs">
      <label :for="`${id}-state`" class="font-medium">State</label>
      <select :id="`${id}-state`" v-model="stateId" :class="inputClass">
        <option value="" disabled>Choose a state</option>
        <option v-for="state in statesQuery.data.value ?? []" :key="state.id" :value="state.id">
          {{ state.name }}
        </option>
      </select>
    </div>

    <template v-if="stateId">
      <form
        class="max-w-2xl space-y-4 rounded border border-border p-4"
        novalidate
        @submit.prevent="picked && upload.mutate(picked)"
      >
        <h3 class="font-display text-xl font-medium text-heading">
          Upload a file for {{ stateName }}
        </h3>
        <div>
          <label :for="`${id}-file`" class="font-medium">File</label>
          <input
            :id="`${id}-file`"
            ref="fileInput"
            type="file"
            accept=".pdf,.xlsx,.csv,.json,.txt"
            class="mt-1 block"
            @change="onFile"
          />
          <p class="mt-1 text-sm text-muted-foreground">
            PDF, Excel (.xlsx), CSV, JSON or text; up to 25 MB.
          </p>
        </div>

        <p v-if="checking" class="text-muted-foreground">Checking the file…</p>
        <p v-if="fileProblem" role="alert" class="text-danger">{{ fileProblem }}</p>
        <p
          v-if="picked?.duplicate"
          role="alert"
          class="rounded border-l-4 border-highlight bg-surface px-4 py-2 text-foreground"
        >
          {{ duplicateText(picked.duplicate) }}
        </p>

        <template v-if="picked && !picked.duplicate">
          <div>
            <label :for="`${id}-title`" class="font-medium">Title</label>
            <input :id="`${id}-title`" v-model="title" type="text" :class="inputClass" />
          </div>
          <div>
            <label :for="`${id}-url`" class="font-medium"
              >State’s URL for this file (optional)</label
            >
            <input :id="`${id}-url`" v-model="url" type="url" :class="inputClass" />
          </div>
          <div class="max-w-xs">
            <label :for="`${id}-date`" class="font-medium">Date on the document (optional)</label>
            <input :id="`${id}-date`" v-model="publisherDate" type="date" :class="inputClass" />
          </div>
          <p v-if="upload.error.value" role="alert" class="text-danger">
            Could not upload: {{ upload.error.value.message }}
          </p>
          <button
            type="submit"
            class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
            :disabled="upload.isPending.value"
          >
            {{ upload.isPending.value ? 'Uploading…' : 'Upload' }}
          </button>
        </template>
      </form>

      <p v-if="done" role="status" class="text-foreground">{{ done }}</p>

      <p v-if="sourcesQuery.isPending.value" class="text-muted-foreground">Loading…</p>
      <p v-else-if="sourcesQuery.isError.value" role="alert" class="text-foreground">
        Could not load the stored files. Reload the page to try again.
      </p>
      <p v-else-if="(sourcesQuery.data.value ?? []).length === 0" class="text-muted-foreground">
        No files stored for {{ stateName }} yet.
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Stored files for
            {{
              stateName
            }}
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">Title</th>
              <th scope="col" class="py-2 pr-4 font-medium">Dated</th>
              <th scope="col" class="py-2 pr-4 font-medium">Stored</th>
              <th scope="col" class="py-2 pr-4 font-medium">Type</th>
              <th scope="col" class="py-2 pr-4 font-medium">Size</th>
              <th scope="col" class="py-2 pr-4 font-medium">Versions</th>
              <th scope="col" class="py-2 font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="source in sourcesQuery.data.value"
              :key="source.id"
              class="border-b border-border align-top"
            >
              <td class="py-2 pr-4">{{ source.title }}</td>
              <td class="py-2 pr-4 whitespace-nowrap">
                {{ source.publisherDate ? formatIsoDate(source.publisherDate) : '' }}
              </td>
              <td class="py-2 pr-4 whitespace-nowrap">
                {{ formatTimestampDate(source.retrievedAt) }} by {{ source.uploadedBy }}
              </td>
              <td class="py-2 pr-4 uppercase">{{ source.fileType }}</td>
              <td class="py-2 pr-4 whitespace-nowrap">{{ formatSize(source.byteSize) }}</td>
              <td class="py-2 pr-4">{{ versionText(source) }}</td>
              <td class="space-x-3 py-2 whitespace-nowrap">
                <a :href="`/api/admin/sources/${source.id}/file`" download>Download</a>
                <a v-if="source.url" :href="source.url" rel="noopener noreferrer" target="_blank"
                  >State’s copy</a
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
