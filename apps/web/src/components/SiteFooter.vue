<script setup lang="ts">
import {
  AMA_NOTICE_SHORT,
  dataLastUpdated,
  dataUpdatedText,
  FOOTER_NAV_LABEL,
  FOOTER_TEXT,
  footerLinks,
  STATUTE_CITATION,
  STATUTE_LINK_TEXT,
  STATUTE_URL,
} from '@mfcd/shared'
import { computed } from 'vue'

import { usePublicStates } from '../lib/public-states'
import AboutLinkView from './about/AboutLinkView.vue'

// The footer of every page (M6 step 3b; links and "Data last updated" since M8 step 4): where
// the data comes from, what the site is not, the law and the AMA notice. The Worker's
// server-rendered HTML has the same words (`footerHtml`). The date is the newest published
// list's last update, from the state list every public page shares (one cached query).

const { data } = usePublicStates()
const updatedAt = computed(() => (data.value ? dataLastUpdated(data.value.items) : null))
</script>

<template>
  <footer class="border-t border-border">
    <div class="mx-auto max-w-6xl space-y-3 px-4 py-6 text-sm text-muted-foreground">
      <nav :aria-label="FOOTER_NAV_LABEL">
        <ul class="flex flex-wrap gap-x-4 gap-y-1">
          <li v-for="link in footerLinks" :key="link.href"><AboutLinkView :link="link" /></li>
        </ul>
      </nav>
      <p v-if="updatedAt">{{ dataUpdatedText(updatedAt) }}</p>
      <p class="max-w-prose">{{ FOOTER_TEXT }}</p>
      <p>
        <a :href="STATUTE_URL" rel="noopener noreferrer external" class="text-link">{{
          STATUTE_LINK_TEXT
        }}</a>
        ({{ STATUTE_CITATION }})
      </p>
      <p class="max-w-prose">{{ AMA_NOTICE_SHORT }}</p>
    </div>
  </footer>
</template>
