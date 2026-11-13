<script setup lang="ts">
import {
  OVERLAPS_COUNT_NOTE,
  OVERLAPS_GROUP_HEADING,
  OVERLAPS_SIZE_HEADING,
  overlapRowText,
  overlapsCaption,
  type OverlapsResponse,
  overlapStateHeaderText,
  overlapsStatusText,
  overlapsToggleText,
  overlapsVisible,
  OVERLAPS_TOP,
} from '@mfcd/shared'
import { computed, ref, watch } from 'vue'

import OverlapRow from './OverlapRow.vue'

// The Overlaps table (an UpSet view, Lex et al. 2014): a row per exclusive intersection, the
// largest first, the top 20 until "Show all"; a column per state with its set size above. A
// real table: the row header says each row in words, numbers are text, and the dots and bars
// are hidden from assistive tech (WCAG 1.3.1, 1.4.1). It scrolls inside its own region, so the
// page never scrolls sideways.

const props = defineProps<{ data: OverlapsResponse }>()

const all = ref(false)
watch(
  () => props.data.category.id,
  () => {
    all.value = false
  },
)

const names = computed(() => new Map(props.data.states.map((s) => [s.id, s.name])))
const rows = computed(() => overlapsVisible(props.data.intersections, all.value))
const caption = computed(() => overlapsCaption(props.data.category.label))
const maxSize = computed(() => props.data.intersections[0]?.size ?? 0)
const maxSet = computed(() => props.data.states[0]?.codeCount ?? 0)
const setHeight = (n: number) =>
  maxSet.value > 0 ? `${String(Math.max(4, (n / maxSet.value) * 100))}%` : '0%'
const rowText = (row: OverlapsResponse['intersections'][number]) =>
  overlapRowText(row, names.value, props.data.states.length)
</script>

<template>
  <div class="space-y-3">
    <p class="max-w-prose text-sm text-muted-foreground">{{ OVERLAPS_COUNT_NOTE }}</p>
    <p class="text-sm" aria-live="polite">{{ overlapsStatusText(data, rows.length) }}</p>
    <div
      class="relative max-w-full overflow-x-auto rounded-lg border border-border"
      role="region"
      :aria-label="`${caption}, table`"
      tabindex="0"
    >
      <table class="border-separate border-spacing-0 text-sm">
        <caption class="sr-only">
          {{
            caption
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="sticky left-0 z-10 bg-surface px-3 py-2 text-left align-bottom">
              {{ OVERLAPS_GROUP_HEADING }}
            </th>
            <th scope="col" class="bg-surface px-3 py-2 text-left align-bottom">
              {{ OVERLAPS_SIZE_HEADING }}
            </th>
            <th
              v-for="s in data.states"
              :key="s.id"
              scope="col"
              class="w-8 min-w-8 bg-surface px-0 pt-2 pb-1 align-bottom font-normal"
            >
              <span class="sr-only">{{ overlapStateHeaderText(s.name, s.codeCount) }}</span>
              <span aria-hidden="true" class="flex flex-col items-center gap-1">
                <span class="font-mono text-xs">{{ s.codeCount }}</span>
                <span class="flex h-16 w-3 items-end">
                  <span
                    class="block w-full bg-cover-mid"
                    :style="{ height: setHeight(s.codeCount) }"
                  ></span>
                </span>
                <span class="text-xs font-semibold">{{ s.id }}</span>
              </span>
            </th>
          </tr>
        </thead>
        <OverlapRow
          v-for="r in rows"
          :key="r.stateIds.join(',')"
          :row="r"
          :states="data.states"
          :text="rowText(r)"
          :max-size="maxSize"
        />
      </table>
    </div>
    <button
      v-if="data.intersections.length > OVERLAPS_TOP"
      type="button"
      class="rounded border border-input-border px-3 py-1.5 font-semibold hover:bg-surface"
      @click="all = !all"
    >
      {{ overlapsToggleText(all, data.intersections.length) }}
    </button>
  </div>
</template>
