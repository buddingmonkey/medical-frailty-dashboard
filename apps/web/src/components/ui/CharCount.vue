<script setup lang="ts">
// A counter under a field with `maxlength`, so the limit needs no sentence of its own. Point the
// field's `aria-describedby` at `id`. Not a live region: it would speak on every key.
defineProps<{
  id: string
  value: string
  max: number
}>()
</script>

<template>
  <p :id="id" class="mt-1 text-sm text-muted-foreground">
    {{ value.length.toLocaleString('en-US') }} / {{ max.toLocaleString('en-US') }} characters
  </p>
</template>
