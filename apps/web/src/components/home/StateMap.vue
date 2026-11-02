<script setup lang="ts">
import type { PublicStateSummary, StateStatus } from '@mfcd/shared'
import { usMap } from '@mfcd/shared/us-map'
import { computed, useId } from 'vue'
import { useRouter } from 'vue-router'

import { stateLinkLabel } from '../../lib/public-states'

// The home map (roadmap M3 step 2): Albers USA shapes, precomputed (packages/reference-data,
// us-map.ts), filled by status. Every state is a link in alphabetical tab order; hover or focus
// makes it the active state, which the page shows in its card. Status is never colour alone:
// announced states are hatched, and the table view holds the same data.

const props = defineProps<{ states: readonly PublicStateSummary[] }>()
const active = defineModel<string | null>('active', { required: true })

const router = useRouter()
const titleId = useId()
const hatchId = useId()

const shapes = computed(() => {
  const byId = new Map(props.states.map((s) => [s.id, s]))
  return usMap.states
    .map((shape) => {
      const state: PublicStateSummary = byId.get(shape.id) ?? {
        id: shape.id,
        slug: shape.id.toLowerCase(),
        name: shape.name,
        fips: shape.fips,
        status: 'none',
        published: null,
      }
      return { ...shape, state, href: `/states/${state.slug}`, label: stateLinkLabel(state) }
    })
    .sort((a, b) => a.state.name.localeCompare(b.state.name))
})

/** Drawn again on top, so its outline is not hidden under a neighbour. */
const activeShape = computed(() => shapes.value.find((s) => s.id === active.value) ?? null)

const outlineLayers = [
  { class: 'stroke-heading', width: 5 },
  { class: 'stroke-highlight', width: 2.5 },
]

const fillClass: Record<StateStatus, string> = {
  published: 'fill-map-published',
  announced: '',
  none: 'fill-map-none',
}

function open(event: MouseEvent, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  void router.push(href)
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${String(usMap.width)} ${String(usMap.height)}`"
    role="group"
    :aria-labelledby="titleId"
    class="h-auto w-full"
  >
    <title :id="titleId">Map of state frailty code lists</title>
    <defs>
      <pattern
        :id="hatchId"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" class="fill-map-none" />
        <line x1="0" y1="0" x2="0" y2="6" class="stroke-map-announced" stroke-width="3" />
      </pattern>
    </defs>
    <a
      v-for="s in shapes"
      :key="s.id"
      :href="s.href"
      :aria-label="s.label"
      class="map-state outline-none"
      @mouseenter="active = s.id"
      @focus="active = s.id"
      @click="open($event, s.href)"
    >
      <path
        :d="s.d"
        :class="fillClass[s.state.status]"
        :fill="s.state.status === 'announced' ? `url(#${hatchId})` : undefined"
        class="stroke-map-border"
        stroke-width="1"
      />
      <!-- DC is a few pixels wide; give it a target that can be seen and hit. -->
      <circle
        v-if="s.id === 'DC'"
        :cx="s.cx"
        :cy="s.cy"
        r="6"
        :class="fillClass[s.state.status]"
        class="stroke-map-border"
        stroke-width="1.5"
      />
    </a>
    <!-- Gold over navy: visible on the blue of a listed state and on the grey of the rest. -->
    <g
      v-if="activeShape"
      aria-hidden="true"
      class="pointer-events-none"
      fill="none"
      stroke-linejoin="round"
    >
      <template v-for="layer in outlineLayers" :key="layer.class">
        <path :d="activeShape.d" :class="layer.class" :stroke-width="layer.width" />
        <circle
          v-if="activeShape.id === 'DC'"
          :cx="activeShape.cx"
          :cy="activeShape.cy"
          r="6"
          :class="layer.class"
          :stroke-width="layer.width"
        />
      </template>
    </g>
  </svg>
</template>
