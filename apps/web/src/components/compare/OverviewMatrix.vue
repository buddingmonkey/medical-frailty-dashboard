<script setup lang="ts">
import {
  type CoverageBand,
  coverageBand,
  nextOverviewOrder,
  overviewCategoryGroups,
  overviewCellLabel,
  overviewCellNotReviewed,
  overviewCellText,
  overviewDrillDownPath,
  type OverviewOrder,
  overviewOverall,
  orderOverviewStates,
  OVERVIEW_NO_LIST,
  type PublicOverviewResponse,
} from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// The overview matrix (roadmap M5 step 5): a row per state, a column per published unified
// category under its federal parent, and an overall column. Every cell carries its number as
// text (WCAG 1.4.1); the headers are real `th`s with scopes (WCAG 1.3.1). Each column header is
// a sort button; the page owns the order and announces it.

const props = defineProps<{ data: PublicOverviewResponse; caption: string }>()
const order = defineModel<OverviewOrder>('order', { required: true })

const groups = computed(() => overviewCategoryGroups(props.data.categories))
/** The rows in order, each cell beside its category (cells come in `categories` order). */
const rows = computed(() =>
  orderOverviewStates(props.data.states, order.value).map((state) => ({
    state,
    cells: props.data.categories.flatMap((category, i) => {
      const cell = state.cells[i]
      return cell ? [{ category, cell }] : []
    }),
  })),
)

function ariaSort(column: 'overall' | number): 'ascending' | 'descending' | undefined {
  const o = order.value
  const active =
    column === 'overall' ? o.by === 'overall' : o.by === 'category' && o.unifiedId === column
  if (!active || !('dir' in o)) return undefined
  return o.dir === 'desc' ? 'descending' : 'ascending'
}

function sortBy(column: 'overall' | number) {
  order.value = nextOverviewOrder(order.value, column)
}

const arrow = (column: 'overall' | number) => {
  const sort = ariaSort(column)
  return sort === undefined ? '' : sort === 'descending' ? '▼' : '▲'
}

const shade: Record<CoverageBand, string> = {
  high: 'bg-cover-high text-on-cover-high',
  mid: 'bg-cover-mid text-on-cover-mid',
  low: 'bg-cover-low text-on-cover-low',
  none: 'hatch-none text-foreground',
}
</script>

<template>
  <div
    class="max-h-[75vh] overflow-auto rounded-lg border border-border"
    role="region"
    aria-label="Which states cover what, table"
    tabindex="0"
  >
    <table class="min-w-full border-separate border-spacing-0 text-sm">
      <caption class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead class="sticky top-0 z-20">
        <tr>
          <th
            scope="col"
            rowspan="2"
            class="sticky left-0 z-30 min-w-28 sm:min-w-36 border-b border-border bg-surface px-3 py-2 text-left align-bottom"
          >
            State
          </th>
          <th
            v-for="g in groups"
            :key="g.federalCategory"
            scope="colgroup"
            :colspan="g.categories.length"
            class="border-b border-l-2 border-b-border border-l-background bg-surface px-2 py-1.5 text-left align-bottom text-xs font-semibold text-heading"
          >
            {{ g.label }}
          </th>
          <th
            scope="col"
            rowspan="2"
            :aria-sort="ariaSort('overall')"
            class="border-b border-border bg-surface px-2 py-2 text-right align-bottom"
          >
            <button
              type="button"
              class="inline-flex items-end gap-1 font-semibold"
              @click="sortBy('overall')"
            >
              Overall<span aria-hidden="true" class="w-3 text-xs">{{ arrow('overall') }}</span>
            </button>
          </th>
        </tr>
        <tr>
          <th
            v-for="c in data.categories"
            :key="c.id"
            scope="col"
            :aria-sort="ariaSort(c.id)"
            class="max-w-28 min-w-20 border-b border-border bg-surface px-1 py-1.5 text-left align-bottom font-semibold leading-tight"
          >
            <button
              type="button"
              class="inline-flex items-end gap-1 text-left"
              @click="sortBy(c.id)"
            >
              <span
                >{{ c.label
                }}<template v-if="c.coverageBasis === 'union'"
                  >&nbsp;†<span class="sr-only">
                    (share of the codes any state lists)</span
                  ></template
                ></span
              ><span aria-hidden="true" class="w-3 shrink-0 text-xs">{{ arrow(c.id) }}</span>
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="{ state: s, cells } in rows" :key="s.id">
          <th
            scope="row"
            class="sticky left-0 z-10 border-b border-border bg-background px-3 py-1 text-left font-normal sm:whitespace-nowrap"
          >
            <RouterLink :to="`/states/${s.slug}`">{{ s.name }}</RouterLink>
          </th>
          <td
            v-if="!s.hasList"
            :colspan="data.categories.length + 1"
            class="border-b border-border bg-cover-nolist px-3 py-1 text-muted-foreground"
          >
            {{ OVERVIEW_NO_LIST }}
          </td>
          <template v-else>
            <td
              v-for="{ category: c, cell } in cells"
              :key="c.id"
              class="border-b border-border p-0.5"
            >
              <RouterLink
                :to="overviewDrillDownPath(c.slug, s.id)"
                :aria-label="overviewCellLabel(s.name, c, cell)"
                class="block min-w-14 rounded-sm px-1 py-1.5 text-center font-mono text-xs font-medium no-underline hover:underline"
                :class="shade[coverageBand(cell.share)]"
                >{{ overviewCellText(cell.share)
                }}<span v-if="overviewCellNotReviewed(cell)" aria-hidden="true">*</span></RouterLink
              >
            </td>
            <td class="border-b border-border px-2 py-1 text-right font-mono text-xs font-semibold">
              {{ overviewCellText(overviewOverall(s)) }}
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>
