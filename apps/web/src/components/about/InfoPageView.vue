<script setup lang="ts">
import type { InfoPage } from '@mfcd/shared'
import { nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'

import { usePageMeta } from '../../lib/page-meta'
import AboutBlocks from './AboutBlocks.vue'

// About/methodology, disclaimer, privacy and accessibility (roadmap M8 step 4): one layout for
// the words in packages/shared/src/about.ts, the same as the Worker's HTML (`infoPageParts`).

const props = defineProps<{ page: InfoPage }>()
usePageMeta(() => ({ title: props.page.title, description: props.page.description }))

// A "learn more" link (`/about#matching`) opens at its section. The router does not scroll
// (its `scrollBehavior` is deprecated in Vue Router 5), so the page does it when it opens or
// the hash changes.
const route = useRoute()
watch(
  () => route.hash,
  async (hash) => {
    if (hash === '') return
    await nextTick()
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
  },
  { immediate: true },
)
</script>

<template>
  <article class="max-w-prose space-y-8">
    <header class="space-y-3">
      <h1 class="font-display text-4xl font-medium text-heading">{{ page.heading }}</h1>
      <AboutBlocks :blocks="page.intro" />
    </header>
    <nav v-if="page.sections.length > 3" aria-label="On this page">
      <ul class="list-disc space-y-1 pl-6">
        <li v-for="s in page.sections" :key="s.id">
          <a :href="`#${s.id}`" class="text-link">{{ s.heading }}</a>
        </li>
      </ul>
    </nav>
    <section
      v-for="s in page.sections"
      :key="s.id"
      :aria-labelledby="s.id"
      class="scroll-mt-4 space-y-3"
    >
      <h2 :id="s.id" class="font-display text-2xl font-medium text-heading">{{ s.heading }}</h2>
      <AboutBlocks :blocks="s.blocks" />
    </section>
  </article>
</template>
