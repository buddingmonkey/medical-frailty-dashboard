<script setup lang="ts">
import { COMPARE_LEGEND_HEADING, compareLegend, learnMore } from '@mfcd/shared'
import { useId } from 'vue'
import AboutLinkView from '../about/AboutLinkView.vue'

// What each cell word and the badges mean (M6 step 3b): under every code table (single codes,
// a category's codes, states side by side). Wording in packages/shared/src/compare.ts.

const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId" class="max-w-prose space-y-2 text-sm">
    <h3 :id="headingId" class="font-semibold">{{ COMPARE_LEGEND_HEADING }}</h3>
    <dl class="space-y-1">
      <div v-for="item in compareLegend" :key="item.term">
        <dt class="inline font-semibold">{{ item.term }}:</dt>
        <dd class="inline">{{ ' ' }}{{ item.text }}</dd>
      </div>
    </dl>
    <p><AboutLinkView :link="learnMore.badges" /></p>
  </section>
</template>
