<script setup lang="ts">
import {
  descriptionSourceText,
  DRILL_COUNT_HEADING,
  DRILL_RULES_HEADING,
  type DrillGroup,
  drillCountText,
  drillGroupCountText,
  drillGroupsOpen,
  type DrillResponse,
  drillRuleText,
  DRILL_NOBODY,
  NO_DESCRIPTION,
} from '@mfcd/shared'
import { computed, ref, watch } from 'vue'

import DrillCellView from './DrillCellView.vue'
import { qualificationColours } from './qualification-colours'

// The drill-down table (roadmap M5 step 6): a body per group (ICD-10-CM category, or code
// system), whose header row opens and closes it; a row per code with a bar and "N of M states",
// the states' rules as counts, the focus state's cell, and a Details button. Groups start
// closed with "All codes" and open with a filter (as in the approved mockup).

const props = defineProps<{ data: DrillResponse; caption: string }>()
/** The row whose details are open (a pattern key). */
const code = defineModel<string | null>('code', { required: true })

/** Groups the reader toggled away from the default. Cleared when the filter changes. */
const toggled = ref(new Set<string>())
watch(
  () => props.data.query.show,
  () => {
    toggled.value = new Set()
  },
)
const isOpen = (g: DrillGroup) =>
  drillGroupsOpen(props.data.query.show) !== toggled.value.has(g.key)
function toggle(g: DrillGroup) {
  const next = new Set(toggled.value)
  if (next.has(g.key)) next.delete(g.key)
  else next.add(g.key)
  toggled.value = next
}

const total = computed(() => props.data.states.length)
/** A state's name from its postal code (the description's source). */
const stateName = (id: string) => props.data.states.find((s) => s.id === id)?.name ?? id
const focusState = computed(
  () => props.data.states.find((s) => s.id === props.data.query.focus) ?? null,
)
const columns = computed(() => (focusState.value ? 5 : 4))
const percent = (n: number) => (total.value === 0 ? 0 : Math.round((n / total.value) * 100))
</script>

<template>
  <div
    class="overflow-x-auto rounded-lg border border-border"
    role="region"
    :aria-label="`${caption}, table`"
    tabindex="0"
  >
    <table class="w-full border-collapse text-sm">
      <caption class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead class="bg-surface text-left">
        <tr>
          <th scope="col" class="sticky left-0 z-10 bg-surface px-3 py-2">Code</th>
          <th scope="col" class="min-w-40 px-3 py-2">Description</th>
          <th scope="col" class="px-3 py-2">{{ DRILL_COUNT_HEADING }}</th>
          <th scope="col" class="min-w-36 px-3 py-2">{{ DRILL_RULES_HEADING }}</th>
          <th
            v-if="focusState"
            scope="col"
            class="min-w-36 border-l-2 border-l-highlight px-3 py-2"
          >
            {{ focusState.name }}
          </th>
        </tr>
      </thead>
      <tbody v-for="g in data.groups" :key="g.key">
        <tr class="border-t border-border bg-surface align-top">
          <th scope="rowgroup" class="sticky left-0 z-10 bg-surface px-3 py-2 text-left">
            <button
              type="button"
              class="inline-flex items-center gap-1.5 font-mono font-semibold text-heading"
              :aria-expanded="isOpen(g)"
              @click="toggle(g)"
            >
              <span
                aria-hidden="true"
                class="inline-block text-xs motion-safe:transition-transform"
                :class="isOpen(g) ? 'rotate-90' : ''"
                >▶</span
              >{{ g.label }}
            </button>
          </th>
          <td class="px-3 py-2 font-semibold">
            {{ g.description ?? '' }}
            <span class="text-xs font-normal text-muted-foreground"
              >({{ g.rowCount }} {{ g.rowCount === 1 ? 'code' : 'codes' }})</span
            >
          </td>
          <td class="px-3 py-2">
            <span class="flex items-center gap-2">
              <span
                aria-hidden="true"
                class="h-2 w-12 shrink-0 sm:w-20 overflow-hidden rounded-sm bg-cover-low"
              >
                <span
                  class="block h-full bg-cover-high"
                  :style="{ width: `${percent(g.anyCount)}%` }"
                ></span>
              </span>
              <span class="font-mono text-xs whitespace-nowrap">{{
                drillGroupCountText(g.anyCount, total)
              }}</span>
            </span>
          </td>
          <td :colspan="columns - 3"></td>
        </tr>
        <template v-if="isOpen(g)">
          <tr v-for="r in g.rows" :key="r.key" class="border-t border-border align-top">
            <th
              scope="row"
              class="sticky left-0 z-10 bg-background py-2 pr-3 pl-8 text-left font-mono font-semibold whitespace-nowrap"
            >
              <RouterLink v-if="r.codePath" :to="r.codePath" class="text-link">{{
                r.display
              }}</RouterLink
              ><template v-else>{{ r.display }}</template>
            </th>
            <td class="px-3 py-2">
              <template v-if="r.description">
                {{ r.description }}
                <span
                  v-if="r.descriptionSource && r.descriptionSource !== 'cms'"
                  class="block text-xs text-muted-foreground"
                  >{{ descriptionSourceText(stateName(r.descriptionSource)) }}</span
                >
              </template>
              <span v-else class="text-muted-foreground">{{ NO_DESCRIPTION }}</span>
            </td>
            <td class="px-3 py-2">
              <span class="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="h-2 w-12 shrink-0 sm:w-20 overflow-hidden rounded-sm bg-cover-low"
                >
                  <span
                    class="block h-full bg-cover-high"
                    :style="{ width: `${percent(r.count)}%` }"
                  ></span>
                </span>
                <span class="font-mono text-xs whitespace-nowrap">{{
                  drillCountText(r.count, total)
                }}</span>
              </span>
            </td>
            <td class="px-3 py-2">
              <span class="flex flex-wrap gap-1">
                <span
                  v-for="rule in r.rules"
                  :key="rule.qualification"
                  class="inline-block rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
                  :class="qualificationColours[rule.qualification]"
                  >{{ drillRuleText(rule) }}</span
                >
                <span v-if="r.rules.length === 0" class="text-xs text-muted-foreground">{{
                  DRILL_NOBODY
                }}</span>
              </span>
              <button
                type="button"
                class="mt-1 text-sm text-link underline"
                :aria-label="`Details for ${r.display}`"
                :aria-pressed="code === r.key"
                @click="code = code === r.key ? null : r.key"
              >
                Details
              </button>
            </td>
            <td v-if="r.focus" class="border-l-2 border-l-highlight px-3 py-2">
              <DrillCellView :cell="r.focus" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
