<script setup lang="ts">
import {
  compareWithText,
  SIMILAR_PICK_MAX,
  SIMILARITY_NOTE,
  type SimilarState,
  similarityText,
  statesComparePath,
} from '@mfcd/shared'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

// "States with the most similar lists" on a state page (roadmap M5 step 7): the most similar
// states by pair similarity, a link to compare with each one, and checkboxes to compare with up
// to three at once (the comparison takes 2–4 states).

const props = defineProps<{
  state: { id: string; name: string }
  similar: readonly SimilarState[]
}>()

const router = useRouter()

const picked = ref(new Set<string>())
watch(
  () => props.state.id,
  () => {
    picked.value = new Set()
  },
)

function toggle(id: string, on: boolean) {
  const next = new Set(picked.value)
  if (on) next.add(id)
  else next.delete(id)
  picked.value = next
}

/** The chosen states in list order (most similar first). */
const chosen = computed(() => props.similar.filter((s) => picked.value.has(s.id)).map((s) => s.id))
const full = computed(() => chosen.value.length >= SIMILAR_PICK_MAX)

function compareChosen() {
  if (chosen.value.length === 0) return
  void router.push(statesComparePath([props.state.id, ...chosen.value]))
}

const percent = (jaccard: number) => Math.round(jaccard * 100)
</script>

<template>
  <section aria-labelledby="similar-heading" class="space-y-4">
    <h2 id="similar-heading" class="font-display text-2xl font-medium text-heading">
      States with the most similar lists
    </h2>
    <p class="max-w-prose text-sm text-muted-foreground">{{ SIMILARITY_NOTE }}</p>
    <p v-if="similar.length === 0" class="max-w-prose">
      No other state has a list to compare with yet.
    </p>
    <form v-else class="space-y-4" @submit.prevent="compareChosen">
      <ul class="max-w-2xl divide-y divide-border border-y border-border">
        <li
          v-for="s in similar"
          :key="s.id"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto]"
        >
          <label class="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              :checked="picked.has(s.id)"
              :disabled="!picked.has(s.id) && full"
              @change="toggle(s.id, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ s.name }}</span>
          </label>
          <span class="col-start-1 flex items-center gap-2 sm:col-start-2 sm:row-start-1">
            <span class="font-mono text-sm tabular-nums"
              ><span class="sr-only">Similarity </span>{{ similarityText(s.jaccard) }}</span
            >
            <span
              aria-hidden="true"
              class="h-2 w-full max-w-48 overflow-hidden rounded-sm bg-cover-low"
            >
              <span
                class="block h-full bg-cover-high"
                :style="{ width: `${percent(s.jaccard)}%` }"
              ></span>
            </span>
          </span>
          <RouterLink
            :to="statesComparePath([state.id, s.id])"
            class="col-start-2 row-span-2 row-start-1 text-sm text-link sm:col-start-3 sm:row-span-1"
            >Compare with {{ s.name }}</RouterLink
          >
        </li>
      </ul>
      <p class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="rounded bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-50"
          :disabled="chosen.length === 0"
        >
          {{ compareWithText(state.name, chosen.length) }}
        </button>
        <span class="text-sm text-muted-foreground"
          >Choose up to {{ SIMILAR_PICK_MAX }} states to compare side by side.</span
        >
      </p>
    </form>
  </section>
</template>
