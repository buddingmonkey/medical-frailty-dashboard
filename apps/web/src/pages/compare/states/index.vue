<script setup lang="ts">
import {
  pageTitles,
  STATES_LANDING_HEADING,
  STATES_LANDING_INTRO,
  STATES_LANDING_OWN_HEADING,
  STATES_LANDING_OWN_LABEL,
  STATES_LANDING_PICK_HEADING,
  statesComparePath,
} from '@mfcd/shared'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CompareTabs from '../../../components/compare/CompareTabs.vue'
import StatesPicker from '../../../components/compare/StatesPicker.vue'
import SimilarStates from '../../../components/states/SimilarStates.vue'
import { usePageTitle } from '../../../lib/page-title'
import { usePublicState, usePublicStates } from '../../../lib/public-states'

// The "States side by side" tab (project lead, 2026-11-02): pick your state to see the states
// whose lists are most like it (the state page's list, reused), or choose 2 to 4 states. Your
// state lives in the URL (`?state=ga`); `?states=` is the no-JavaScript form, which the Worker
// redirects to the comparison. The Worker renders the same page as HTML.

usePageTitle(pageTitles.statesLanding)

const route = useRoute()
const router = useRouter()
const states = usePublicStates()
const choices = computed(() => (states.data.value?.items ?? []).filter((s) => s.published !== null))

const ownSlug = computed<string>({
  get: () => {
    const value = route.query['state']
    const slug = typeof value === 'string' ? value.toLowerCase() : ''
    return choices.value.some((s) => s.slug === slug) ? slug : ''
  },
  set: (slug) => {
    void router.replace({ query: slug === '' ? {} : { state: slug } })
  },
})
const own = usePublicState(ownSlug)
const ownData = computed(() => (ownSlug.value === '' ? undefined : own.data.value))

function open(ids: string[]) {
  void router.push(statesComparePath(ids))
}
</script>

<template>
  <article class="space-y-8">
    <header class="space-y-3">
      <h1 class="font-display text-4xl font-medium text-heading">{{ STATES_LANDING_HEADING }}</h1>
      <CompareTabs />
      <p class="max-w-prose">{{ STATES_LANDING_INTRO }}</p>
    </header>

    <p v-if="states.error.value" role="alert" class="text-danger">
      The states could not be loaded. Please try again later.
    </p>
    <p v-else-if="!states.data.value" class="text-muted-foreground">Loading…</p>
    <p v-else-if="choices.length < 2">Fewer than 2 states have a list on this site yet.</p>

    <template v-else>
      <section aria-labelledby="own-state-heading" class="space-y-4">
        <h2 id="own-state-heading" class="font-display text-2xl font-medium text-heading">
          {{ STATES_LANDING_OWN_HEADING }}
        </h2>
        <div class="flex flex-col gap-1">
          <label for="own-state" class="text-sm font-semibold">{{
            STATES_LANDING_OWN_LABEL
          }}</label>
          <select
            id="own-state"
            v-model="ownSlug"
            class="w-fit rounded border border-input-border bg-background px-2 py-1.5"
          >
            <option value="">Choose a state</option>
            <option v-for="s in choices" :key="s.id" :value="s.slug">{{ s.name }}</option>
          </select>
        </div>
        <p v-if="ownSlug !== '' && own.error.value" role="alert" class="text-danger">
          The similar states could not be loaded. Please try again later.
        </p>
        <SimilarStates v-else-if="ownData" :state="ownData.state" :similar="ownData.similar" />
      </section>

      <section aria-labelledby="pick-states-heading" class="space-y-4">
        <h2 id="pick-states-heading" class="font-display text-2xl font-medium text-heading">
          {{ STATES_LANDING_PICK_HEADING }}
        </h2>
        <StatesPicker :choices="choices" :current="[]" @compare="open" />
      </section>
    </template>
  </article>
</template>
