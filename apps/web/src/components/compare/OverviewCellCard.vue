<script setup lang="ts">
import { overviewCellCard, type OverviewCellCardPayload } from '@mfcd/shared'
import { HoverCard, HoverCardContent, type HoverCardController } from '@ui-sdk/vue/hover-card'

// One card for every cell of the overview matrix: each cell is a trigger on the same
// controller and passes its payload, and the content renders only while the card is open.

defineProps<{ controller: HoverCardController<OverviewCellCardPayload> }>()

const CellContent = HoverCardContent<OverviewCellCardPayload>

const card = (p: OverviewCellCardPayload) => overviewCellCard(p.stateName, p.category, p.cell)
</script>

<template>
  <HoverCard :controller="controller">
    <CellContent
      v-slot="{ state }"
      side="top"
      :side-offset="6"
      :collision-padding="16"
      class="w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-3 text-left text-sm text-foreground shadow-lg transition-[opacity,scale] duration-150 [transform-origin:var(--transform-origin)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
    >
      <template v-if="state.payload">
        <template v-for="c in [card(state.payload)]" :key="c.state + c.category">
          <p class="font-semibold text-heading">{{ c.state }}</p>
          <p class="text-xs text-muted-foreground">{{ c.category }}</p>
          <p class="mt-2 font-mono text-2xl font-semibold text-heading">{{ c.share }}</p>
          <p>{{ c.covered }}</p>
          <p class="mt-1">{{ c.entries }}</p>
          <p v-if="c.review" class="mt-1 text-muted-foreground">{{ c.review }}</p>
          <p class="mt-2 text-xs text-muted-foreground">{{ c.hint }}</p>
        </template>
      </template>
    </CellContent>
  </HoverCard>
</template>
