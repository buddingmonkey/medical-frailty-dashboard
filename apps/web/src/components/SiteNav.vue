<script setup lang="ts">
import { siteNav, siteNavCurrent } from '@mfcd/shared'
import { computed, ref, useId, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

// The main navigation (project lead, 2026-11-02). A bar under the site name on wide screens;
// a "Menu" button that shows the same list on small ones. The list lives in
// packages/shared/src/public.ts so the server-rendered HTML carries the same links.

const route = useRoute()
const current = computed(() => siteNavCurrent(route.path))

const open = ref(false)
const listId = useId()
const buttonEl = useTemplateRef<HTMLButtonElement>('button')

// Any navigation closes the menu.
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)

function close() {
  if (!open.value) return
  open.value = false
  buttonEl.value?.focus()
}

/** `page` on the page itself; `true` on a deeper page of that section. */
function ariaCurrent(path: string) {
  if (route.path === path) return 'page'
  return current.value?.path === path ? 'true' : undefined
}
</script>

<template>
  <nav aria-label="Main" class="contents" @keydown.escape="close">
    <button
      ref="button"
      type="button"
      class="flex items-center gap-1.5 rounded-md border border-on-header/40 px-2 py-1.5 text-on-header hover:bg-on-header/10 focus-visible:outline-highlight sm:hidden"
      :aria-expanded="open"
      :aria-controls="listId"
      @click="open = !open"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" class="size-5" fill="currentColor">
        <path
          v-if="!open"
          d="M3 5h14a1 1 0 1 0 0-2H3a1 1 0 0 0 0 2Zm14 4H3a1 1 0 0 0 0 2h14a1 1 0 1 0 0-2Zm0 6H3a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2Z"
        />
        <path
          v-else
          d="M4.3 4.3a1 1 0 0 1 1.4 0L10 8.6l4.3-4.3a1 1 0 1 1 1.4 1.4L11.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 0 1-1.4-1.4L8.6 10 4.3 5.7a1 1 0 0 1 0-1.4Z"
        />
      </svg>
      Menu
    </button>
    <ul
      :id="listId"
      :data-open="String(open)"
      class="order-last flex w-full flex-col gap-1 border-t border-on-header/20 pt-2 data-[open=false]:hidden sm:flex-row sm:pt-3 sm:data-[open=false]:flex"
    >
      <li v-for="item in siteNav" :key="item.path">
        <RouterLink
          :to="item.path"
          :aria-current="ariaCurrent(item.path)"
          class="block rounded-md px-3 py-2 font-semibold text-on-header no-underline hover:bg-on-header/10 focus-visible:outline-highlight"
          :class="
            current?.path === item.path
              ? 'bg-on-header/15 underline decoration-highlight decoration-2 underline-offset-8'
              : ''
          "
          >{{ item.label }}</RouterLink
        >
      </li>
    </ul>
  </nav>
</template>
