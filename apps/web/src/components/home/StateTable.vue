<script setup lang="ts">
import { formatCount, formatDay, type PublicStateSummary, stateStatusLabels } from '@mfcd/shared'
import { RouterLink } from 'vue-router'

// The map's data as a table: for screen readers, small screens and anyone who prefers it.

defineProps<{ states: readonly PublicStateSummary[] }>()
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-left text-sm">
      <caption class="sr-only">
        State frailty code lists
      </caption>
      <thead class="border-b-2 border-border">
        <tr>
          <th scope="col" class="py-2 pr-4">State</th>
          <th scope="col" class="py-2 pr-4">Status</th>
          <th scope="col" class="py-2 pr-4 text-right">Entries</th>
          <th scope="col" class="py-2">State list dated</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in states" :key="s.id" class="border-b border-border">
          <th scope="row" class="py-2 pr-4 font-normal">
            <RouterLink :to="`/states/${s.slug}`" class="text-link">{{ s.name }}</RouterLink>
          </th>
          <td class="py-2 pr-4">{{ stateStatusLabels[s.status] }}</td>
          <td class="py-2 pr-4 text-right tabular-nums">
            {{ s.published ? formatCount(s.published.totalEntries) : '' }}
          </td>
          <td class="py-2">
            {{ s.published?.sourceDate ? formatDay(s.published.sourceDate) : '' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
