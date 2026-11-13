<script setup lang="ts">
import {
  OVERLAP_IN_GROUP,
  OVERLAP_NOT_IN_GROUP,
  type OverlapIntersection,
  type OverlapState,
} from '@mfcd/shared'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@ui-sdk/vue/collapsible'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// One exclusive intersection of the Overlaps table: its own <tbody>, the row and, once its
// header is pressed, a second row listing its codes (a ui-sdk Collapsible; the disclosure
// pattern). The row header says it all in words; the bar and the dots are hidden.

const props = defineProps<{
  row: OverlapIntersection
  /** The state columns, in order. */
  states: readonly OverlapState[]
  text: string
  /** The largest row's size: the full bar. */
  maxSize: number
}>()

const members = computed(() => new Set(props.row.stateIds))
const span = computed(() => {
  const at = props.states.flatMap((s, i) => (members.value.has(s.id) ? [i] : []))
  return { first: at[0] ?? -1, last: at.at(-1) ?? -1 }
})
const barWidth = computed(() =>
  props.maxSize > 0 ? `${String(Math.max(2, (props.row.size / props.maxSize) * 100))}%` : '0%',
)
</script>

<template>
  <Collapsible>
    <template #render="{ props: rootProps, children }">
      <tbody v-bind="rootProps" class="group/row">
        <component :is="children" />
      </tbody>
    </template>
    <tr>
      <th
        scope="row"
        class="sticky left-0 z-10 w-56 min-w-48 border-t border-border bg-background p-0 text-left align-middle font-normal sm:w-72"
      >
        <CollapsibleTrigger
          class="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left text-link hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <span
            aria-hidden="true"
            class="mt-0.5 inline-block shrink-0 transition-transform motion-reduce:transition-none group-data-open/row:rotate-90"
            >▸</span
          >
          <span>{{ text }}</span>
        </CollapsibleTrigger>
      </th>
      <td class="border-t border-border px-3 py-2 align-middle">
        <span class="flex items-center gap-2">
          <span
            aria-hidden="true"
            class="h-2 w-16 shrink-0 overflow-hidden rounded-sm bg-cover-low sm:w-24"
          >
            <span class="block h-full bg-cover-high" :style="{ width: barWidth }"></span>
          </span>
          <span class="font-mono whitespace-nowrap">{{ row.size }}</span>
        </span>
      </td>
      <td
        v-for="(s, i) in states"
        :key="s.id"
        class="relative w-8 min-w-8 border-t border-border p-0 align-middle"
      >
        <span class="sr-only">{{
          members.has(s.id) ? OVERLAP_IN_GROUP : OVERLAP_NOT_IN_GROUP
        }}</span>
        <span aria-hidden="true" class="relative flex h-8 items-center justify-center">
          <span
            v-if="i > span.first && i <= span.last"
            class="absolute top-1/2 right-1/2 left-0 h-0.5 -translate-y-1/2 bg-cover-high"
          ></span>
          <span
            v-if="i >= span.first && i < span.last"
            class="absolute top-1/2 right-0 left-1/2 h-0.5 -translate-y-1/2 bg-cover-high"
          ></span>
          <span
            data-dot
            class="relative size-3 rounded-full"
            :class="
              members.has(s.id) ? 'bg-cover-high' : 'border border-cover-none-line bg-background'
            "
          ></span>
        </span>
      </td>
    </tr>
    <CollapsiblePanel>
      <template #render="{ props: panelProps }">
        <tr v-bind="panelProps">
          <td :colspan="states.length + 2" class="bg-surface px-3 py-2">
            <ul class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
              <li v-for="c in row.codes" :key="c.key">
                <RouterLink v-if="c.codePath" :to="c.codePath" class="text-link">{{
                  c.display
                }}</RouterLink>
                <template v-else>{{ c.display }}</template>
              </li>
            </ul>
          </td>
        </tr>
      </template>
    </CollapsiblePanel>
  </Collapsible>
</template>
