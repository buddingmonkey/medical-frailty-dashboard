<script setup lang="ts">
import { type AboutLink, isExternalHref } from '@mfcd/shared'
import { RouterLink } from 'vue-router'

// One link from packages/shared/src/about.ts: off-site links open as plain external links, links
// within the site go through the router (and scroll to their section).

defineProps<{ link: AboutLink }>()
</script>

<template>
  <a
    v-if="isExternalHref(link.href)"
    :href="link.href"
    rel="noopener noreferrer external"
    class="text-link"
    >{{ link.text }}</a
  >
  <RouterLink v-else :to="link.href" class="text-link">{{ link.text }}</RouterLink>
</template>
