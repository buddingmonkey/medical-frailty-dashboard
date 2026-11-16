<script setup lang="ts">
import AppTooltip from './AppTooltip.vue'

// A small "i" button beside a form field's label; its tooltip says what the field does. It opens
// on hover, keyboard focus or a tap (touch screens), and the help also describes the button, so
// a screen reader hears it on focus. Put it outside the <label>: the field keeps the label's own
// text as its name.

defineProps<{
  /** The field's visible label; the button is named "About <label>". */
  label: string
  text: string
}>()
</script>

<template>
  <AppTooltip
    :text="text"
    toggleable
    type="button"
    :aria-label="`About ${label}`"
    class="ml-1 inline-flex size-6 cursor-help items-center justify-center rounded-full align-middle text-muted-foreground hover:bg-surface hover:text-foreground"
  >
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  </AppTooltip>
</template>
