<script setup lang="ts">
// The add-a-state guide, read from the doc itself so there is one copy (docs/add-state-source.md).
import guide from '../../../../../docs/add-state-source.md?raw'
import MarkdownView from '../../components/MarkdownView.vue'
</script>

<template>
  <section>
    <MarkdownView :source="guide" />
  </section>
</template>
