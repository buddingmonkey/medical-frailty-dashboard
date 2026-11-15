<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/vue/tooltip'

// A short plain-text hint on hover and keyboard focus, in our tokens (ui-sdk's web.css is not
// loaded). The text is in the page from the start, so it describes the trigger before it opens.
// `toggleable` lets a press open it too, for touch screens: use it when the hint is the
// trigger's only job. Attributes such as `class` go on the trigger button.

defineOptions({ inheritAttrs: false })

defineProps<{ text: string; toggleable?: boolean }>()
</script>

<template>
  <Tooltip :toggleable="toggleable" type="description">
    <TooltipTrigger v-bind="$attrs"><slot /></TooltipTrigger>
    <TooltipContent
      :side-offset="6"
      :collision-padding="8"
      class="max-w-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm leading-snug font-normal text-foreground shadow-md"
      >{{ text }}</TooltipContent
    >
  </Tooltip>
</template>
