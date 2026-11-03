<script setup lang="ts">
import {
  CODE_DETAIL_CONFIRMED,
  CODE_DETAIL_NOT_FOUND,
  CODE_DETAIL_OTHERS,
  codeDetailDescriptionNote,
  codeDetailGroups,
  CODE_DETAIL_NO_DESCRIPTION,
  codeDetailColumns,
  codeDetailNarrowerText,
  codeDetailPageTitle,
  codeDetailSummary,
  codeSystemLabels,
  formatDay,
  stateCategoryName,
  codeDetailMetaDescription,
} from '@mfcd/shared'
import { computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import LikeCodes from '../../../components/codes/LikeCodes.vue'
import QualificationBadge from '../../../components/compare/QualificationBadge.vue'
import { useCodeDetail } from '../../../composables/useCodeDetail'
import { ApiError } from '../../../lib/api'
import { usePageMeta } from '../../../lib/page-meta'

// One code's page (roadmap M6 step 3): the code and its official description, then every state
// grouped by status, included first. Wording lives in packages/shared/src/code-detail.ts.

const route = useRoute('/codes/[system]/[code]')
const router = useRouter()
const { data, error, isPending } = useCodeDetail(
  () => route.params.system.toLowerCase(),
  () => route.params.code,
)

// Another spelling (`f200`, `ICD-10-CM`): the canonical address, as the Worker's 301 does.
watch(data, (d) => {
  if (d && decodeURIComponent(route.path) !== decodeURIComponent(d.code.path)) {
    void router.replace({ path: d.code.path, query: route.query, hash: route.hash })
  }
})

const notFound = computed(() => error.value instanceof ApiError && error.value.status === 404)
usePageMeta(() =>
  notFound.value
    ? { title: CODE_DETAIL_NOT_FOUND.title, description: CODE_DETAIL_NOT_FOUND.body }
    : data.value
      ? {
          title: codeDetailPageTitle(data.value.code, data.value.states),
          description: codeDetailMetaDescription(data.value.code, data.value.states),
        }
      : null,
)
/** One plain sentence per state with a list (the server HTML shows the same). */
const summary = computed(() =>
  data.value ? codeDetailSummary(data.value.code, data.value.states) : null,
)

const groups = computed(() => (data.value ? codeDetailGroups(data.value.states) : []))
/** "Included" (listed or covered), then the other states; a part with no states is left out. */
const parts = computed(() =>
  [
    { id: 'confirmed', ...CODE_DETAIL_CONFIRMED, groups: groups.value.filter((g) => g.confirmed) },
    { id: 'others', ...CODE_DETAIL_OTHERS, groups: groups.value.filter((g) => !g.confirmed) },
  ].filter((p) => p.groups.length > 0),
)
const showRule = computed(() => data.value?.showQualification !== 'none')
</script>

<template>
  <p v-if="isPending" class="text-muted-foreground">Loading…</p>

  <section v-else-if="notFound" class="max-w-prose space-y-4">
    <h1 class="font-display text-3xl font-medium text-heading">
      {{ CODE_DETAIL_NOT_FOUND.heading }}
    </h1>
    <p>
      {{ CODE_DETAIL_NOT_FOUND.body }}
      <RouterLink to="/compare" class="text-link">Compare states</RouterLink>
    </p>
  </section>

  <p v-else-if="error" role="alert" class="text-danger">
    This code could not be loaded. Please try again later.
  </p>

  <article v-else-if="data" class="space-y-10">
    <header class="max-w-prose space-y-2">
      <p class="text-sm text-muted-foreground">{{ codeSystemLabels[data.code.codeSystem] }}</p>
      <h1 class="font-display text-4xl font-medium text-heading">
        <span class="font-mono">{{ data.code.display }}</span>
        <span v-if="data.code.description" class="block text-2xl">{{ data.code.description }}</span>
      </h1>
      <p class="text-sm text-muted-foreground">
        {{ codeDetailDescriptionNote(data.code.codeSystem, data.code.description !== null) }}
      </p>
    </header>

    <section v-if="summary" aria-label="Summary" class="max-w-prose space-y-2">
      <p class="font-semibold">{{ summary.count }}</p>
      <ul
        v-for="p in summary.parts"
        :key="p.id"
        :aria-label="p.heading"
        class="list-disc space-y-1 pl-5"
      >
        <li v-for="(s, i) in p.sentences" :key="i">{{ s }}</li>
      </ul>
    </section>

    <section
      v-for="part in parts"
      :key="part.id"
      :aria-labelledby="`${part.id}-heading`"
      class="space-y-6"
    >
      <div class="max-w-prose space-y-1">
        <h2 :id="`${part.id}-heading`" class="font-display text-2xl font-medium text-heading">
          {{ part.heading }}
        </h2>
        <p>{{ part.help }}</p>
      </div>

      <section
        v-for="g in part.groups"
        :key="g.status"
        :aria-labelledby="`group-${g.status}`"
        class="space-y-2"
      >
        <h3 :id="`group-${g.status}`" class="text-lg font-semibold text-heading">
          {{ g.heading }}
          <span class="font-normal text-muted-foreground">({{ g.states.length }})</span>
        </h3>
        <p class="max-w-prose text-sm">{{ g.help }}</p>

        <div v-if="g.confirmed" class="overflow-x-auto rounded-lg border border-border">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              {{
                g.heading
              }}
            </caption>
            <thead class="bg-surface">
              <tr>
                <th scope="col" class="px-3 py-2">{{ codeDetailColumns.state }}</th>
                <th scope="col" class="px-3 py-2">{{ codeDetailColumns.entry }}</th>
                <th scope="col" class="min-w-48 px-3 py-2">
                  {{ codeDetailColumns.description }}
                </th>
                <th scope="col" class="px-3 py-2">{{ codeDetailColumns.category }}</th>
                <th scope="col" class="px-3 py-2">{{ codeDetailColumns.tier }}</th>
                <th v-if="showRule" scope="col" class="px-3 py-2">{{ codeDetailColumns.rule }}</th>
                <th scope="col" class="min-w-40 px-3 py-2">{{ codeDetailColumns.source }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="s in g.states" :key="s.id">
                <tr
                  v-for="(e, i) in s.entries"
                  :key="`${s.id}-${String(i)}`"
                  class="border-t border-border align-top"
                >
                  <th
                    v-if="i === 0"
                    scope="row"
                    :rowspan="s.entries.length"
                    class="px-3 py-2 font-semibold"
                  >
                    <RouterLink :to="`/states/${s.slug}`" class="text-link">{{
                      s.name
                    }}</RouterLink>
                  </th>
                  <td class="px-3 py-2 font-mono whitespace-nowrap">
                    {{ e.rawCode }}
                    <span v-if="e.display !== e.rawCode" class="block text-xs text-muted-foreground"
                      >({{ e.display }})</span
                    >
                  </td>
                  <td class="px-3 py-2">
                    <template v-if="e.description">{{ e.description }}</template>
                    <span v-else class="text-muted-foreground">{{
                      CODE_DETAIL_NO_DESCRIPTION
                    }}</span>
                  </td>
                  <td class="px-3 py-2">
                    {{ stateCategoryName(e.stateCategory, e.stateSubcategory) }}
                  </td>
                  <td class="px-3 py-2">{{ e.tier ?? '' }}</td>
                  <td v-if="showRule" class="px-3 py-2">
                    <QualificationBadge
                      v-if="e.qualification && e.qualificationBasis"
                      :match="{
                        qualification: e.qualification,
                        qualificationBasis: e.qualificationBasis,
                      }"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <a
                      v-if="e.source.url"
                      :href="e.source.url"
                      class="text-link"
                      rel="noopener noreferrer external"
                      target="_blank"
                      >{{ e.source.title }}</a
                    >
                    <template v-else>{{ e.source.title }}</template>
                    <span v-if="e.source.publisherDate" class="block text-xs">{{
                      formatDay(e.source.publisherDate)
                    }}</span>
                    <span v-if="e.source.locator" class="block text-xs">{{
                      e.source.locator
                    }}</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul
          v-else
          :aria-label="g.heading"
          class="flex flex-wrap gap-x-4 gap-y-1 text-sm"
          :class="g.status === 'narrower' ? 'flex-col' : ''"
        >
          <li v-for="s in g.states" :key="s.id">
            <RouterLink :to="`/states/${s.slug}`" class="text-link">{{ s.name }}</RouterLink
            ><span v-if="g.status === 'narrower'" class="text-muted-foreground"
              >: {{ codeDetailNarrowerText(s.narrowerCount) }}</span
            >
          </li>
        </ul>
      </section>
    </section>
    <LikeCodes :states="data.states" :groups="data.conditionGroups ?? []" />
  </article>
</template>
