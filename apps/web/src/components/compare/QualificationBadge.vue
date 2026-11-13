<script setup lang="ts">
import { type CompareMatch, compareQualificationText, qualificationHelp } from '@mfcd/shared'
import { computed } from 'vue'

import AppTooltip from '../ui/AppTooltip.vue'
import { qualificationColours } from './qualification-colours'

// The state's own rule for an entry, as a coloured badge (docs/legal-review.md, item 2; docs/status.md, "Tiers and
// qualification"; wording in packages/shared/src/qualification.ts, provisional). A button whose
// tooltip, opened by hover, focus or a tap, gives the rule's help; the help also describes it.

const props = defineProps<{ match: Pick<CompareMatch, 'qualification' | 'qualificationBasis'> }>()

const text = computed(() => compareQualificationText(props.match))
</script>

<template>
  <AppTooltip
    :text="qualificationHelp[match.qualification]"
    toggleable
    class="inline-block cursor-help rounded px-1.5 py-0.5 text-xs font-medium"
    :class="qualificationColours[match.qualification]"
    >{{ text }}</AppTooltip
  >
</template>
