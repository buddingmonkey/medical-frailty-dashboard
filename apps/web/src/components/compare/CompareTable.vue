<script setup lang="ts">
import {
  codeSystemLabels,
  type CompareCell,
  compareCellText,
  compareFiledUnder,
  type CompareQuery,
  type CompareResponse,
} from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import QualificationBadge from './QualificationBadge.vue'

// The aligned table: a row per code, a column per state (roadmap M4 step 2).

const props = defineProps<{ data: CompareResponse; query: CompareQuery; caption: string }>()

const stateName = computed(() => new Map(props.data.states.map((s) => [s.id, s.name])))

const tone: Record<CompareCell['status'], string> = {
  exact: 'font-semibold',
  covered: 'font-semibold',
  narrower: 'text-muted-foreground',
  not_listed: 'text-muted-foreground',
  no_list: 'text-muted-foreground italic',
}
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-border">
    <table class="w-full border-collapse text-sm">
      <caption class="sr-only">
        {{
          caption
        }}
      </caption>
      <thead class="bg-surface text-left">
        <tr>
          <th scope="col" class="sticky left-0 bg-surface px-3 py-2">Code</th>
          <th scope="col" class="min-w-56 px-3 py-2">Description</th>
          <th v-for="s in data.states" :key="s.id" scope="col" class="min-w-44 px-3 py-2">
            <RouterLink :to="`/states/${s.slug}`" class="text-link">{{ s.name }}</RouterLink>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in data.rows"
          :key="`${row.codeSystem}|${row.matchKind}|${row.codeNorm}|${row.rangeEndNorm ?? ''}|${String(row.wildcard)}`"
          class="border-t border-border align-top"
        >
          <th
            scope="row"
            class="sticky left-0 bg-background px-3 py-2 text-left font-normal whitespace-nowrap"
          >
            <span class="font-mono font-semibold">{{ row.display }}</span>
            <span class="block text-xs text-muted-foreground">{{
              codeSystemLabels[row.codeSystem]
            }}</span>
          </th>
          <td class="px-3 py-2">
            <template v-if="row.description">
              {{ row.description }}
              <span
                v-if="row.descriptionSource && row.descriptionSource !== 'cms'"
                class="block text-xs text-muted-foreground"
                >{{ stateName.get(row.descriptionSource) ?? row.descriptionSource }}’s text</span
              >
            </template>
            <span v-else class="text-muted-foreground">No description published</span>
          </td>
          <td v-for="(cell, i) in row.cells" :key="data.states[i]?.id ?? i" class="px-3 py-2">
            <span class="block" :class="tone[cell.status]">{{ compareCellText(cell) }}</span>
            <template v-if="cell.match">
              <span v-if="cell.match.tier" class="block text-xs">{{ cell.match.tier }}</span>
              <QualificationBadge :match="cell.match" class="mt-1" />
              <span
                v-if="compareFiledUnder(query, data.states[i]?.id ?? '', cell.match)"
                class="block text-xs text-muted-foreground"
                >Filed under
                {{ compareFiledUnder(query, data.states[i]?.id ?? '', cell.match) }}</span
              >
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
