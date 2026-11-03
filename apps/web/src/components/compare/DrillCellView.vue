<script setup lang="ts">
import {
  compareCellText,
  type DrillCell,
  drillFiledUnder,
  STATE_CATEGORY_PREFIX,
} from '@mfcd/shared'
import { computed } from 'vue'

import QualificationBadge from './QualificationBadge.vue'

// One state's cell in the drill-down (focus column and details): the M4 words, the state's
// tier, its rule as a badge, and the state's own category.

const props = defineProps<{ cell: DrillCell }>()

const filedUnder = computed(() => (props.cell.match ? drillFiledUnder(props.cell.match) : null))
</script>

<template>
  <span class="block" :class="cell.match ? 'font-semibold' : 'text-muted-foreground'">{{
    compareCellText(cell)
  }}</span>
  <template v-if="cell.match">
    <span v-if="cell.match.tier" class="block text-xs">{{ cell.match.tier }}</span>
    <QualificationBadge :match="cell.match" class="mt-0.5" />
    <span v-if="filedUnder" class="block text-xs text-muted-foreground"
      >{{ STATE_CATEGORY_PREFIX }} {{ filedUnder }}</span
    >
  </template>
</template>
