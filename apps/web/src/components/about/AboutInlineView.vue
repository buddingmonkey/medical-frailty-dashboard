<script setup lang="ts">
import type { AboutInline } from '@mfcd/shared'

import AboutLinkView from './AboutLinkView.vue'

// Text with links, as data (no v-html).

defineProps<{ parts: readonly AboutInline[] }>()
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <template v-if="typeof part === 'string'">{{ part }}</template>
    <AboutLinkView v-else :link="part" />
  </template>
</template>
