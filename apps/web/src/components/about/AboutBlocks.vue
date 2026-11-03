<script setup lang="ts">
import type { AboutBlock } from '@mfcd/shared'

import AboutInlineView from './AboutInlineView.vue'

// Paragraphs, lists and definition lists from packages/shared/src/about.ts. The Worker's HTML
// renders the same blocks (`blocksHtml` in apps/api/src/seo/info-page.ts).

defineProps<{ blocks: readonly AboutBlock[] }>()
</script>

<template>
  <template v-for="(block, i) in blocks" :key="i">
    <p v-if="block.kind === 'p'"><AboutInlineView :parts="block.parts" /></p>
    <ul v-else-if="block.kind === 'ul'" class="list-disc space-y-1 pl-6">
      <li v-for="(item, j) in block.items" :key="j"><AboutInlineView :parts="item" /></li>
    </ul>
    <dl v-else class="space-y-2">
      <div v-for="item in block.items" :key="item.term">
        <dt class="font-semibold">{{ item.term }}</dt>
        <dd class="pl-4"><AboutInlineView :parts="item.parts" /></dd>
      </div>
    </dl>
  </template>
</template>
