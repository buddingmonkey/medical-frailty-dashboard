<script setup lang="ts">
import { type DrillDetailResponse, drillCountText } from '@mfcd/shared'
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import DrillCellView from './DrillCellView.vue'

// Details on demand (roadmap M5 step 6): every state's cell for one row. States that list,
// cover or have narrower codes get a line each; the rest are abbreviations. The heading takes
// focus when a new row opens, so the panel is found on a phone, where it sits below the table.

/** `takeFocus`: the reader opened it here (not a shared link opening the page). */
const props = defineProps<{ detail: DrillDetailResponse; takeFocus: boolean }>()
const emit = defineEmits<{ close: [] }>()

const shown = computed(() =>
  props.detail.states.filter((s) => s.hasList && s.cell.status !== 'not_listed'),
)
const notListed = computed(() =>
  props.detail.states.filter((s) => s.hasList && s.cell.status === 'not_listed'),
)
const noList = computed(() => props.detail.states.filter((s) => !s.hasList))

const heading = useTemplateRef<HTMLHeadingElement>('heading')
watch(
  () => props.detail.row.key,
  async () => {
    if (!props.takeFocus) return
    await nextTick()
    heading.value?.focus()
  },
  { immediate: true },
)
</script>

<template>
  <section
    aria-labelledby="drill-details-heading"
    class="space-y-3 rounded-lg border border-border p-4"
  >
    <div class="flex items-start justify-between gap-2">
      <h2
        id="drill-details-heading"
        ref="heading"
        tabindex="-1"
        class="font-display text-lg font-medium text-heading"
      >
        <span class="font-mono">{{ detail.row.display }}</span>
        {{ detail.row.description ?? '' }}
      </h2>
      <button
        type="button"
        class="shrink-0 rounded border border-input-border px-2 py-0.5 text-sm"
        @click="emit('close')"
      >
        Close details
      </button>
    </div>
    <p class="text-sm">
      Listed by {{ drillCountText(detail.row.count, detail.statesWithList) }} with lists.
    </p>
    <ul v-if="shown.length > 0" class="space-y-2 text-sm">
      <li v-for="s in shown" :key="s.id">
        <span class="font-semibold">{{ s.name }}</span>
        <DrillCellView :cell="s.cell" />
      </li>
    </ul>
    <div v-if="notListed.length > 0" class="text-sm">
      <p class="font-semibold">Not listed ({{ notListed.length }})</p>
      <p class="font-mono text-xs leading-relaxed">
        <template v-for="(s, i) in notListed" :key="s.id"
          >{{ i > 0 ? ' ' : '' }}<abbr :title="s.name">{{ s.id }}</abbr></template
        >
      </p>
    </div>
    <div v-if="noList.length > 0" class="text-sm">
      <p class="font-semibold">No list on this site ({{ noList.length }})</p>
      <p class="font-mono text-xs leading-relaxed">
        <template v-for="(s, i) in noList" :key="s.id"
          >{{ i > 0 ? ' ' : '' }}<abbr :title="s.name">{{ s.id }}</abbr></template
        >
      </p>
    </div>
  </section>
</template>
