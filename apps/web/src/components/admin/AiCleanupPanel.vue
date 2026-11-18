<script setup lang="ts">
import {
  aiCleanupResponseSchema,
  aiCleanupStatusSchema,
  buildCleanupPrompt,
  parseAiOutput,
  type RawTable,
  splitIntoParts,
  type TextPart,
} from '@mfcd/shared'
import { useMutation, useQuery } from '@tanstack/vue-query'
import { computed, ref, useId, watch } from 'vue'

import type { ParseInput } from '../../ingest/parse'
import { runParser } from '../../ingest/run-parser'
import { getJson, sendJson } from '../../lib/api'
import InfoTip from '../ui/InfoTip.vue'

// AI cleanup (docs/ingestion.md, "AI cleanup"): for a file the adapters cannot read, build a
// prompt per part for any AI assistant, and read its JSON answer back as a table. With the
// optional API key set, a button asks Claude directly. Either way the answer is data: it is
// validated (parseAiOutput) and then mapped and reviewed like any file.
const props = defineProps<{
  stateId: string
  stateName: string
  source: ParseInput
  /** Open the panel at once: the parent sets it when the file could not be read. */
  open?: boolean
}>()
const emit = defineEmits<{ table: [table: RawTable] }>()

const partHelp =
  'A long file is split into parts that each fit in one answer. Each answer becomes its own table, which is mapped, reviewed and sent to the draft separately.'

const id = useId()
const status = useQuery({
  queryKey: ['admin', 'ai-cleanup'],
  queryFn: () => getJson('/api/admin/ai-cleanup', aiCleanupStatusSchema),
  staleTime: Infinity,
})

const fileName = computed(() => (props.source.kind === 'file' ? props.source.name : 'Pasted table'))
const parts = ref<TextPart[]>([])
const partNo = ref(1)
const preparing = ref(false)
const problem = ref<string | null>(null)
const answer = ref('')
const done = ref<string | null>(null)

const part = computed(() => parts.value.find((p) => p.number === partNo.value))
const prompt = computed(() =>
  part.value
    ? buildCleanupPrompt({ stateName: props.stateName, fileName: fileName.value, part: part.value })
    : '',
)
const pagesLabel = (p: TextPart) =>
  p.firstPage === p.lastPage
    ? `page ${String(p.firstPage)}`
    : `pages ${String(p.firstPage)}–${String(p.lastPage)}`

watch(
  () => props.source,
  () => {
    parts.value = []
    answer.value = ''
    done.value = null
    problem.value = null
  },
)

async function prepare() {
  preparing.value = true
  problem.value = null
  try {
    const pages =
      props.source.kind === 'file'
        ? ((await runParser({ ...props.source, textOnly: true })).pageTexts ?? [])
        : chunkLines(props.source.text)
    parts.value = splitIntoParts(pages)
    partNo.value = 1
  } catch (error) {
    problem.value =
      error instanceof Error
        ? error.message
        : 'This file could not be read. Try another copy of the file, or paste the table as text.'
  } finally {
    preparing.value = false
  }
}

function chunkLines(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const pages: string[] = []
  for (let i = 0; i < lines.length; i += 100) pages.push(lines.slice(i, i + 100).join('\n'))
  return pages
}

const copied = ref(false)
async function copy() {
  copied.value = false
  try {
    await navigator.clipboard.writeText(prompt.value)
    copied.value = true
  } catch {
    problem.value =
      'The prompt could not be copied. Select the text of the prompt and copy it by hand.'
  }
}

function read(text: string, source: string) {
  problem.value = null
  done.value = null
  try {
    const table = parseAiOutput(text, `${fileName.value}, AI part ${String(partNo.value)}`)
    done.value = `Read ${String(table.rows.length)} ${table.rows.length === 1 ? 'row' : 'rows'} from ${source}. Map and review them below.`
    emit('table', table)
  } catch (error) {
    problem.value =
      error instanceof Error
        ? error.message
        : 'The answer could not be read. Check that it is the JSON the prompt asks for, then try again.'
  }
}

/** The "Ask Claude" button works only when the server has an API key (it costs per use). */
const claudeOn = computed(() => status.data.value?.enabled === true)
function askClaude(p: TextPart) {
  if (claudeOn.value && !ask.isPending.value) ask.mutate(p)
}

const ask = useMutation({
  mutationFn: (p: TextPart) =>
    sendJson(
      'POST',
      '/api/admin/ai-cleanup',
      { stateId: props.stateId, fileName: fileName.value, part: p },
      aiCleanupResponseSchema,
    ),
  onSuccess: (res) => {
    read(res.text, res.model)
  },
  onError: (error) => {
    problem.value = error.message
  },
})

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
</script>

<template>
  <details
    class="max-w-4xl rounded border border-border p-4"
    :open="open || undefined"
    :aria-labelledby="`${id}-t`"
  >
    <summary class="cursor-pointer">
      <h3 :id="`${id}-t`" class="inline font-display text-xl font-medium text-heading">
        Get help from an AI assistant
      </h3>
    </summary>
    <div class="mt-3 space-y-3">
      <p class="max-w-prose text-muted-foreground">
        Use this panel for a scanned file or a table that does not read cleanly. Copy the prompt
        into any AI assistant, then paste its JSON answer below; the answer is checked and reviewed
        like any other file.
      </p>
      <button
        v-if="parts.length === 0"
        type="button"
        :class="smallButton"
        :disabled="preparing"
        @click="prepare"
      >
        Prepare the prompt
      </button>

      <template v-if="part">
        <div class="max-w-xs">
          <label :for="`${id}-part`" class="font-medium">Part</label
          ><InfoTip label="Part" :text="partHelp" />
          <select :id="`${id}-part`" v-model="partNo" :class="inputClass">
            <option v-for="p in parts" :key="p.number" :value="p.number">
              Part {{ p.number }} of {{ p.count }} ({{ pagesLabel(p) }})
            </option>
          </select>
        </div>
        <div>
          <label :for="`${id}-prompt`" class="font-medium">Prompt for part {{ part.number }}</label>
          <textarea
            :id="`${id}-prompt`"
            :value="prompt"
            readonly
            rows="6"
            :class="inputClass"
            class="font-mono text-xs"
          />
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" :class="smallButton" @click="copy">Copy the prompt</button>
            <span v-if="copied" role="status" class="text-sm">The prompt was copied.</span>
            <span class="group relative inline-block">
              <button
                type="button"
                :class="[smallButton, { 'cursor-not-allowed opacity-60': !claudeOn }]"
                :aria-disabled="!claudeOn || ask.isPending.value"
                :aria-describedby="claudeOn ? undefined : `${id}-claude-tip`"
                @click="askClaude(part)"
              >
                Ask Claude for part {{ part.number }}
              </button>
              <span
                v-if="!claudeOn"
                :id="`${id}-claude-tip`"
                role="tooltip"
                class="pointer-events-none absolute top-full left-0 z-10 mt-1 w-72 rounded bg-heading px-2 py-1 text-xs text-on-primary opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
              >
                This button requires an API key on the server. Ask the project lead to set one.
              </span>
            </span>
            <span v-if="ask.isPending.value" role="status" class="text-sm">
              Asking {{ status.data.value?.model }}. A long part can take a few minutes.
            </span>
          </div>
        </div>
        <div>
          <label :for="`${id}-answer`" class="font-medium">The assistant’s answer</label>
          <textarea
            :id="`${id}-answer`"
            v-model="answer"
            rows="4"
            :class="inputClass"
            class="font-mono text-xs"
            placeholder='{"rows": [...]}'
          />
          <button
            type="button"
            class="mt-2 rounded border border-border px-3 py-1 text-sm hover:bg-surface"
            :disabled="answer.trim() === ''"
            @click="read(answer, 'the pasted answer')"
          >
            Read the answer
          </button>
        </div>
      </template>
      <p v-if="done" role="status" class="font-medium">{{ done }}</p>
      <p v-if="problem" role="alert" class="text-danger">{{ problem }}</p>
    </div>
  </details>
</template>
