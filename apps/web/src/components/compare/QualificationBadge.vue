<script setup lang="ts">
import { type CompareMatch, compareQualificationText, qualificationHelp } from '@mfcd/shared'
import { computed } from 'vue'

// The state's own rule for an entry, as a coloured badge (docs/status.md, "Tiers and
// qualification"; wording in packages/shared/src/qualification.ts, provisional).

const props = defineProps<{ match: CompareMatch }>()

const colours = {
  standalone: 'bg-badge-alone-bg text-badge-alone',
  needs_support: 'bg-badge-needs-bg text-badge-needs',
  supporting_only: 'bg-badge-support-bg text-badge-support',
  unknown: 'bg-badge-unknown-bg text-badge-unknown',
} as const

const text = computed(() => compareQualificationText(props.match))
</script>

<template>
  <span
    class="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
    :class="colours[match.qualification]"
    :title="qualificationHelp[match.qualification]"
    >{{ text }}</span
  >
</template>
