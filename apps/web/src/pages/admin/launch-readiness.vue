<script setup lang="ts">
import { launchReadinessResponseSchema } from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { formatTimestampDate } from '../../lib/admin-watch'
import { getJson } from '../../lib/api'

// The launch data gate (roadmap M8 step 1): at least 2 published states whose every category
// mapping is approved and shows "Reviewed". The API applies the rule (`stateIsReady` in packages/shared).
const query = useQuery({
  queryKey: ['admin', 'launch-readiness'],
  queryFn: () => getJson('/api/admin/launch-readiness', launchReadinessResponseSchema),
  // Mappings change on other admin pages; show the current counts when the page opens.
  staleTime: 0,
})
const data = computed(() => query.data.value)

/** Where each count is fixed: the unified mapping screen, or the federal category screen. */
const fixAt = { unified: '/admin/mappings', federal: '/admin/categories' } as const
</script>

<template>
  <section class="space-y-4">
    <h2 class="font-display text-2xl font-medium text-heading">Launch readiness</h2>
    <p class="max-w-prose text-muted-foreground">
      The launch data gate passes when at least 2 states with a published list are ready. A state is
      ready when every category is approved in Mappings and its public page shows “Reviewed” for
      every category.
    </p>

    <p v-if="query.isPending.value" class="text-muted-foreground">Loading…</p>
    <p
      v-else-if="query.isError.value"
      role="alert"
      class="rounded border border-border bg-surface px-4 py-3 text-foreground"
    >
      Could not load launch readiness. Reload the page to try again.
    </p>

    <template v-else-if="data">
      <p
        role="status"
        aria-label="Launch data gate"
        class="rounded border-l-4 bg-surface px-4 py-3 text-foreground"
        :class="data.gatePassed ? 'border-primary' : 'border-highlight'"
      >
        <span class="font-medium">
          {{ data.gatePassed ? 'Launch data gate passes' : 'Launch data gate not passed yet' }}:
        </span>
        {{ data.readyCount }} of {{ data.required }} states ready.
      </p>

      <p v-if="data.states.length === 0" class="text-muted-foreground">
        No state has a published list yet.
      </p>

      <div v-else class="overflow-x-auto">
        <table class="w-full border-collapse text-left text-sm">
          <caption class="sr-only">
            Launch readiness by state
          </caption>
          <thead class="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" class="py-2 pr-4 font-medium">State</th>
              <th scope="col" class="py-2 pr-4 font-medium">Published</th>
              <th scope="col" class="py-2 pr-4 font-medium">Categories</th>
              <th scope="col" class="py-2 pr-4 font-medium">Unified mappings</th>
              <th scope="col" class="py-2 pr-4 font-medium">Public page</th>
              <th scope="col" class="py-2 pr-4 font-medium">Federal mappings (information)</th>
              <th scope="col" class="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in data.states" :key="s.stateId" class="border-b border-border align-top">
              <th scope="row" class="py-2 pr-4 font-medium text-heading">{{ s.name }}</th>
              <td class="py-2 pr-4 whitespace-nowrap">
                Version {{ s.versionNo }}
                <template v-if="s.publishedAt">
                  · {{ formatTimestampDate(s.publishedAt) }}
                </template>
              </td>
              <td class="py-2 pr-4">{{ s.categories }}</td>
              <td class="py-2 pr-4">
                <ul>
                  <li>
                    <RouterLink v-if="s.unified.unmapped > 0" :to="fixAt.unified">
                      {{ s.unified.unmapped }} unmapped
                    </RouterLink>
                    <template v-else>0 unmapped</template>
                  </li>
                  <li>
                    <RouterLink v-if="s.unified.unconfirmed > 0" :to="fixAt.unified">
                      {{ s.unified.unconfirmed }} not approved
                    </RouterLink>
                    <template v-else>0 not approved</template>
                  </li>
                </ul>
              </td>
              <td class="py-2 pr-4">
                <template v-if="s.notReviewed > 0">
                  {{ s.notReviewed }} shown as not yet reviewed
                </template>
                <template v-else>All reviewed</template>
              </td>
              <td class="py-2 pr-4 text-muted-foreground">
                <ul>
                  <li>
                    <RouterLink v-if="s.federal.unmapped > 0" :to="fixAt.federal">
                      {{ s.federal.unmapped }} unmapped
                    </RouterLink>
                    <template v-else>0 unmapped</template>
                  </li>
                  <li>
                    <RouterLink v-if="s.federal.auto > 0" :to="fixAt.federal">
                      {{ s.federal.auto }} guessed
                    </RouterLink>
                    <template v-else>0 guessed</template>
                  </li>
                </ul>
              </td>
              <td class="py-2 font-medium" :class="s.ready ? 'text-heading' : 'text-danger'">
                {{ s.ready ? 'Ready' : 'Not ready' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="max-w-prose text-sm text-muted-foreground">
        Follow a count’s link and choose the state to fix it. The federal counts do not block launch
        on their own. But a code in no unified category shows “Reviewed” only after its federal
        category is confirmed on Federal categories or set by a chapter override. Testing the site
        with real users is the other condition for launch. It is not tracked here.
      </p>
    </template>
  </section>
</template>
