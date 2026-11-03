<script setup lang="ts">
import { FOOTER_TEXT, STATUTE_CITATION, STATUTE_LINK_TEXT, STATUTE_URL } from '@mfcd/shared'

// The footer of every page (M6 step 3b): where the data comes from, what the site is not, and
// the law. The Worker's server-rendered HTML has the same words (`footerHtml`).
</script>

<template>
  <footer class="border-t border-border">
    <div class="mx-auto max-w-6xl space-y-2 px-4 py-6 text-sm text-muted-foreground">
      <p class="max-w-prose">{{ FOOTER_TEXT }}</p>
      <p>
        <a :href="STATUTE_URL" rel="noopener noreferrer external" class="text-link">{{
          STATUTE_LINK_TEXT
        }}</a>
        ({{ STATUTE_CITATION }})
      </p>
    </div>
  </footer>
</template>
