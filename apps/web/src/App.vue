<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'

import SiteNav from './components/SiteNav.vue'
import ThemeMenu from './components/ThemeMenu.vue'
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded focus:bg-background focus:px-4 focus:py-2"
  >
    Skip to main content
  </a>

  <header class="border-b-4 border-highlight bg-header text-on-header">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 pt-5 pb-3">
      <RouterLink
        to="/"
        class="mr-auto font-display text-2xl font-medium text-on-header no-underline"
      >
        Medical Frailty Coding Dashboard
      </RouterLink>
      <SiteNav />
      <ThemeMenu />
    </div>
  </header>

  <main id="main" class="mx-auto max-w-6xl px-4 py-10">
    <RouterView />
  </main>

  <footer class="border-t border-border">
    <div class="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
      Data comes from each state's published policy documents. No patient data.
    </div>
  </footer>
</template>
