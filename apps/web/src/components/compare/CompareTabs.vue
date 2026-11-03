<script setup lang="ts">
import { COMPARE_TABS_LABEL, compareTabMark, compareTabs } from '@mfcd/shared'
import { RouterLink, useRoute } from 'vue-router'

// The tab row under the heading of every /compare page (project lead, 2026-11-02). Links in a
// <nav>, not ARIA tabs: each view is a page with its own URL. `aria-current="page"` marks the
// page itself; `true` marks the parent of a deeper page (a category under Categories, a
// comparison under States side by side). On phones the row scrolls sideways on its own, so the
// page never does. The list lives in packages/shared/src/compare-tabs.ts so the Worker's HTML
// shows the same tabs.

const route = useRoute()
const mark = (path: string) => compareTabMark(path, route.path) ?? undefined
</script>

<template>
  <nav :aria-label="COMPARE_TABS_LABEL" class="max-w-full border-b border-border">
    <ul class="flex gap-1 overflow-x-auto">
      <li v-for="tab in compareTabs" :key="tab.path" class="shrink-0">
        <RouterLink
          :to="tab.path"
          :aria-current="mark(tab.path)"
          class="block border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap no-underline hover:text-heading hover:underline focus-visible:-outline-offset-2"
          :class="mark(tab.path) ? 'border-primary text-heading' : 'border-transparent text-link'"
          >{{ tab.label }}</RouterLink
        >
      </li>
    </ul>
  </nav>
</template>
