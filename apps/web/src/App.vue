<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'

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
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5">
      <RouterLink to="/" class="font-display text-2xl font-medium text-on-header no-underline">
        Medical Frailty Coding Dashboard
      </RouterLink>
      <div class="flex items-center gap-6">
        <nav aria-label="Main">
          <ul class="flex gap-5">
            <li><RouterLink to="/" class="text-on-header">States</RouterLink></li>
            <li><RouterLink to="/compare" class="text-on-header">Compare</RouterLink></li>
          </ul>
        </nav>
        <ThemeMenu />
      </div>
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
