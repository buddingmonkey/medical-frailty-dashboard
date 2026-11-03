<script setup lang="ts">
import { type StatesCompareResponse, statesCompareGroupCountText } from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import DrillCellView from './DrillCellView.vue'

// The comparison table (roadmap M5 step 7): a body per unified category, whose header row
// gives each state's count of the category's codes; a row per code with each state's cell
// (status, tier, rule, the state's own category). With every code shown, the codes that
// differ are marked. The scroll box is `relative` so the sr-only state names in the group rows
// are positioned inside it: otherwise they widen the page on phones.

const props = defineProps<{ data: StatesCompareResponse; caption: string }>()

const columns = computed(() => props.data.states.length + 2)
</script>

<template>
  <div
    class="relative overflow-x-auto rounded-lg border border-border"
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
          <th v-for="s in data.states" :key="s.id" scope="col" class="min-w-36 px-3 py-2">
            {{ s.name }}
          </th>
        </tr>
      </thead>
      <tbody v-for="g in data.groups" :key="`${g.key}-${g.continued}`">
        <tr class="border-t-2 border-border bg-surface align-top">
          <th scope="rowgroup" colspan="2" class="px-3 py-2 text-left">
            <RouterLink
              v-if="g.slug"
              :to="`/compare/${g.slug}`"
              class="font-display text-base font-medium text-heading"
              >{{ g.label }}</RouterLink
            >
            <span v-else class="font-display text-base font-medium text-heading">{{
              g.label
            }}</span>
            <span class="block text-xs font-normal text-muted-foreground"
              >{{ g.differing }} of {{ g.allRows }}
              {{ g.allRows === 1 ? 'code differs' : 'codes differ'
              }}<template v-if="g.continued"> (continued)</template></span
            >
          </th>
          <td v-for="(n, i) in g.counts" :key="i" class="px-3 py-2 text-xs">
            <span class="sr-only">{{ data.states[i]?.name }}: </span
            >{{ statesCompareGroupCountText(n) }}
          </td>
        </tr>
        <tr v-for="r in g.rows" :key="r.key" class="border-t border-border align-top">
          <th
            scope="row"
            class="sticky left-0 z-10 bg-background px-3 py-2 text-left font-mono font-semibold whitespace-nowrap"
          >
            {{ r.display }}
            <span
              v-if="!data.query.diff && r.differs"
              class="mt-0.5 block font-sans text-xs font-medium text-danger"
              >Differs</span
            >
          </th>
          <td class="px-3 py-2">
            <template v-if="r.description">
              {{ r.description }}
              <span
                v-if="r.descriptionSource && r.descriptionSource !== 'cms'"
                class="block text-xs text-muted-foreground"
                >{{ r.descriptionSource }}’s text</span
              >
            </template>
            <span v-else class="text-muted-foreground">No description published</span>
          </td>
          <td v-for="(cell, i) in r.cells" :key="i" class="px-3 py-2">
            <DrillCellView :cell="cell" />
          </td>
        </tr>
      </tbody>
      <tbody v-if="data.groups.length === 0">
        <tr>
          <td :colspan="columns" class="px-3 py-4">These lists do not differ.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
