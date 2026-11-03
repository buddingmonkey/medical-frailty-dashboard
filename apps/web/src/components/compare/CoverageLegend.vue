<script setup lang="ts">
import { type CoverageBand, coverageBandLabels, OVERVIEW_NO_LIST } from '@mfcd/shared'

// The coverage shades (roadmap M5 steps 5 and 8): the overview matrix and the tile map share it,
// so a shade means the same on both. Every swatch has its words beside it (WCAG 1.4.1).

const bands: CoverageBand[] = ['high', 'mid', 'low', 'none']
const swatch: Record<CoverageBand, string> = {
  high: 'bg-cover-high',
  mid: 'bg-cover-mid',
  low: 'bg-cover-low',
  none: 'hatch-none',
}
</script>

<template>
  <ul aria-label="Legend" class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
    <li v-for="b in bands" :key="b" class="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        class="inline-block h-4 w-6 rounded-sm border border-border"
        :class="swatch[b]"
      ></span
      >{{ coverageBandLabels[b] }}
    </li>
    <li class="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        class="inline-block h-4 w-6 rounded-sm border border-border bg-cover-nolist"
      ></span
      >{{ OVERVIEW_NO_LIST }}
    </li>
  </ul>
</template>
