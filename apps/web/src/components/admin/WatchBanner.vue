<script setup lang="ts">
import { groupWatchItems } from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { localToday, useWatchItems } from '../../lib/admin-watch'

const open = useWatchItems('open')

const counts = computed(() => {
  const groups = groupWatchItems(open.data.value ?? [], localToday())
  return { overdue: groups.overdue.length, dueSoon: groups.dueSoon.length }
})
</script>

<template>
  <p
    v-if="counts.overdue > 0 || counts.dueSoon > 0"
    role="status"
    class="rounded border-l-4 border-highlight bg-surface px-4 py-2 text-sm text-foreground"
  >
    <span v-if="counts.overdue > 0" class="font-medium">{{ counts.overdue }} overdue</span>
    <template v-if="counts.overdue > 0 && counts.dueSoon > 0"> · </template>
    <span v-if="counts.dueSoon > 0">{{ counts.dueSoon }} due within 14 days</span>
    ·
    <RouterLink to="/admin/watch">Watch dates</RouterLink>
  </p>
</template>
