<script setup lang="ts">
import { COMPARE_LEGEND_HEADING, compareLegend, learnMore } from '@mfcd/shared'
import { useId } from 'vue'
import AboutLinkView from '../about/AboutLinkView.vue'
import InfoTip from '../ui/InfoTip.vue'

// What each cell word and the badges mean (M6 step 3b): under every code table (single codes,
// a category's codes, states side by side). Wording in packages/shared/src/compare.ts. A
// compact legend since 2026-11-17 (copy review): two columns of term and meaning on wide
// screens; on small ones a row of terms, each meaning in a tooltip.

const headingId = useId()
</script>

<template>
  <section :aria-labelledby="headingId" class="space-y-2 text-sm">
    <h3 :id="headingId" class="font-semibold">{{ COMPARE_LEGEND_HEADING }}</h3>
    <dl class="flex max-w-5xl flex-wrap gap-x-4 gap-y-1 sm:grid sm:grid-cols-2 sm:gap-x-6">
      <div v-for="item in compareLegend" :key="item.term">
        <dt class="inline font-semibold">{{ item.term }}<span class="hidden sm:inline">:</span></dt>
        <dd class="inline">
          <span class="hidden sm:inline">{{ ' ' }}{{ item.text }}</span>
          <InfoTip :label="item.term" :text="item.text" class="sm:hidden" />
        </dd>
      </div>
    </dl>
    <p><AboutLinkView :link="learnMore.badges" /></p>
  </section>
</template>
