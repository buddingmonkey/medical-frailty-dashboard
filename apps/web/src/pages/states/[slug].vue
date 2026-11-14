<script setup lang="ts">
import {
  ADDED_HEADING,
  type CodeSystem,
  codeSystemLabels,
  COMPARE_THESE_CODES,
  compareSearchParams,
  ENTRY_DEFINITION,
  FEDERAL_OVERLAP_NOTE,
  type FederalCategory,
  federalCategoryInfo,
  federalCountsOverlap,
  formatCount,
  formatDay,
  NO_SOURCE_DATE,
  noListText,
  pageTitles,
  type Qualification,
  qualificationLabels,
  REVIEW_STATUS_HEADING,
  reviewStatusText,
  RULE_HEADING,
  SOURCE_DATE_HEADING,
  sourceDetailsText,
  STATE_COUNT_CAPTIONS,
  stateCategoriesIntro,
  learnMore,
  REPORT_LIST_LINK_TEXT,
  REPORT_PROBLEM_URL,
  reportListText,
  pageDescriptions,
  stateDescription,
} from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import MarkdownView from '../../components/MarkdownView.vue'
import SimilarStates from '../../components/states/SimilarStates.vue'
import { ApiError } from '../../lib/api'
import { usePageMeta } from '../../lib/page-meta'
import { usePublicState } from '../../lib/public-states'
import AboutLinkView from '../../components/about/AboutLinkView.vue'

// One state's page (roadmap M3 step 3): summary, counts, its categories and how they map to
// the federal ones, the states with the most similar lists (M5 step 7), the source documents,
// version history and the site's notes.

const route = useRoute('/states/[slug]')
const slug = computed(() => route.params.slug.toLowerCase())
const { data, error, isPending } = usePublicState(slug)

const notFound = computed(() => error.value instanceof ApiError && error.value.status === 404)
const state = computed(() => data.value?.state ?? null)
const published = computed(() => state.value?.published ?? null)
usePageMeta(() =>
  notFound.value
    ? { title: pageTitles.notFound, description: pageDescriptions.notFound }
    : state.value
      ? { title: pageTitles.state(state.value.name), description: stateDescription(state.value) }
      : null,
)

function nonZero<K extends string>(counts: Record<K, number>, label: (key: K) => string) {
  return (Object.entries(counts) as [K, number][])
    .filter(([, n]) => n > 0)
    .map(([key, n]) => ({ key, label: label(key), n }))
}

const countTables = computed(() => {
  const p = published.value
  if (!p) return []
  return [
    {
      caption: STATE_COUNT_CAPTIONS.system,
      heading: 'Code system',
      rows: nonZero(p.bySystem, (k: CodeSystem) => codeSystemLabels[k]),
    },
    {
      caption: STATE_COUNT_CAPTIONS.federal,
      heading: 'Federal category',
      rows: nonZero(p.byFederalCategory, (k: FederalCategory) => federalCategoryInfo[k].label),
    },
    {
      caption: STATE_COUNT_CAPTIONS.rule,
      heading: RULE_HEADING,
      rows: nonZero(p.byQualification, (k: Qualification) => qualificationLabels[k]),
    },
  ]
})

/** The code table (`/compare/codes`) on one of this state's categories. */
function compareLink(category: string, subcategory: string) {
  const id = state.value?.id ?? ''
  const params = compareSearchParams({
    states: [id],
    ownState: id,
    ownCategory: category,
    ownSubcategory: subcategory,
    alone: false,
    page: 1,
  })
  return `/compare/codes?${params.toString()}`
}

function categoryName(category: string, subcategory: string) {
  if (category === '' && subcategory === '') return '(no category)'
  return subcategory === '' ? category : `${category} › ${subcategory}`
}
</script>

<template>
  <p v-if="isPending" class="text-muted-foreground">Loading…</p>

  <section v-else-if="notFound" class="max-w-prose space-y-4">
    <h1 class="font-display text-3xl font-medium text-heading">State not found</h1>
    <p>There is no state at this address. <RouterLink to="/states">See all states</RouterLink></p>
  </section>

  <p v-else-if="error" role="alert" class="text-danger">
    This state could not be loaded. Please try again later.
  </p>

  <article v-else-if="data && state" class="space-y-10">
    <header class="space-y-2">
      <p class="text-sm"><RouterLink to="/states" class="text-link">All states</RouterLink></p>
      <h1 class="font-display text-4xl font-medium text-heading">{{ state.name }}</h1>
    </header>

    <section v-if="!published" class="max-w-prose">
      <p class="text-lg">{{ noListText(state.name, state.status === 'announced') }}</p>
      <p class="mt-3">
        {{ reportListText(state.name) }}
        <AboutLinkView :link="{ text: REPORT_LIST_LINK_TEXT, href: REPORT_PROBLEM_URL }" />
      </p>
    </section>

    <template v-else>
      <section aria-labelledby="summary-heading" class="space-y-3">
        <h2 id="summary-heading" class="sr-only">Summary</h2>
        <dl class="grid gap-4 sm:grid-cols-3">
          <div class="rounded-lg border border-border bg-surface p-4">
            <dt class="text-sm text-muted-foreground">Entries in the state’s list</dt>
            <dd class="text-2xl font-semibold tabular-nums">
              {{ formatCount(published.totalEntries) }}
            </dd>
          </div>
          <div class="rounded-lg border border-border bg-surface p-4">
            <dt class="text-sm text-muted-foreground">{{ SOURCE_DATE_HEADING }}</dt>
            <dd class="text-lg font-semibold">
              {{ published.sourceDate ? formatDay(published.sourceDate) : NO_SOURCE_DATE }}
            </dd>
          </div>
          <div class="rounded-lg border border-border bg-surface p-4">
            <dt class="text-sm text-muted-foreground">{{ ADDED_HEADING }}</dt>
            <dd class="text-lg font-semibold">
              Version {{ published.versionNo
              }}<template v-if="published.updatedAt"
                >, updated {{ formatDay(published.updatedAt) }}</template
              >
            </dd>
          </div>
        </dl>
        <p class="max-w-prose text-sm text-muted-foreground">{{ ENTRY_DEFINITION }}</p>
      </section>

      <section aria-labelledby="counts-heading" class="space-y-4">
        <h2 id="counts-heading" class="font-display text-2xl font-medium text-heading">
          What the list contains
        </h2>
        <div class="grid gap-6 md:grid-cols-3">
          <table
            v-for="t in countTables"
            :key="t.caption"
            class="w-full self-start text-left text-sm"
          >
            <caption class="pb-2 text-left font-semibold text-heading">
              {{
                t.caption
              }}
            </caption>
            <thead class="sr-only">
              <tr>
                <th scope="col">{{ t.heading }}</th>
                <th scope="col">Entries</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in t.rows" :key="row.key" class="border-b border-border">
                <th scope="row" class="py-1.5 pr-4 font-normal">{{ row.label }}</th>
                <td class="py-1.5 text-right tabular-nums">{{ formatCount(row.n) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="federalCountsOverlap(published)" class="max-w-prose text-sm text-muted-foreground">
          {{ FEDERAL_OVERLAP_NOTE }}
        </p>
      </section>

      <section aria-labelledby="categories-heading" class="space-y-4">
        <h2 id="categories-heading" class="font-display text-2xl font-medium text-heading">
          Categories
        </h2>
        <p class="max-w-prose">
          {{ stateCategoriesIntro(state.name) }}
          <AboutLinkView :link="learnMore.stateCategories" />
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              {{
                state.name
              }}’s categories
            </caption>
            <thead class="border-b-2 border-border">
              <tr>
                <th scope="col" class="py-2 pr-4">State category</th>
                <th scope="col" class="py-2 pr-4">Federal category</th>
                <th scope="col" class="py-2 pr-4 text-right">Entries</th>
                <th scope="col" class="py-2 pr-4">{{ REVIEW_STATUS_HEADING }}</th>
                <th scope="col" class="py-2"><span class="sr-only">Compare</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in data.categories"
                :key="`${c.stateCategory}\u0000${c.stateSubcategory}\u0000${c.federalCategory}`"
                class="border-b border-border"
              >
                <th scope="row" class="py-2 pr-4 font-normal">
                  {{ categoryName(c.stateCategory, c.stateSubcategory) }}
                </th>
                <td class="py-2 pr-4">{{ federalCategoryInfo[c.federalCategory].label }}</td>
                <td class="py-2 pr-4 text-right tabular-nums">{{ formatCount(c.entries) }}</td>
                <td class="py-2 pr-4">{{ reviewStatusText(c.confirmed, c.stated) }}</td>
                <td class="py-2">
                  <RouterLink
                    :to="compareLink(c.stateCategory, c.stateSubcategory)"
                    class="text-link"
                    :aria-label="`${COMPARE_THESE_CODES} (${categoryName(c.stateCategory, c.stateSubcategory)}) with other states`"
                    >{{ COMPARE_THESE_CODES }}</RouterLink
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <SimilarStates :state="state" :similar="data.similar" />

      <section aria-labelledby="sources-heading" class="space-y-4">
        <h2 id="sources-heading" class="font-display text-2xl font-medium text-heading">Sources</h2>
        <ul class="list-disc space-y-1 pl-6">
          <li v-for="s in data.sources" :key="s.title">
            <a
              v-if="s.url"
              :href="s.url"
              rel="noopener noreferrer external"
              target="_blank"
              class="text-link"
              >{{ s.title }}</a
            >
            <span v-else>{{ s.title }} (link not known)</span>
            <span class="text-muted-foreground"> · {{ sourceDetailsText(s) }}</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="downloads-heading" class="space-y-4">
        <h2 id="downloads-heading" class="font-display text-2xl font-medium text-heading">
          Downloads
        </h2>
        <p class="max-w-prose">
          Every entry, with its federal category and the source document it came from.
        </p>
        <ul class="list-disc space-y-1 pl-6">
          <li>
            <a :href="`/states/${state.slug}/codes.csv`" download class="text-link"
              >{{ state.name }} codes (CSV)</a
            >
          </li>
          <li>
            <a :href="`/states/${state.slug}/codes.json`" download class="text-link"
              >{{ state.name }} codes (JSON)</a
            >
          </li>
        </ul>
        <p class="max-w-prose"><AboutLinkView :link="learnMore.downloads" /></p>
      </section>

      <section aria-labelledby="versions-heading" class="space-y-4">
        <h2 id="versions-heading" class="font-display text-2xl font-medium text-heading">
          Version history
        </h2>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <caption class="sr-only">
              Version history
            </caption>
            <thead class="border-b-2 border-border">
              <tr>
                <th scope="col" class="py-2 pr-4">Version</th>
                <th scope="col" class="py-2 pr-4">Status</th>
                <th scope="col" class="py-2 pr-4">{{ ADDED_HEADING }}</th>
                <th scope="col" class="py-2 text-right">Entries</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in data.versions" :key="v.versionNo" class="border-b border-border">
                <th scope="row" class="py-2 pr-4 font-normal">{{ v.versionNo }}</th>
                <td class="py-2 pr-4">{{ v.status === 'published' ? 'Current' : 'Replaced' }}</td>
                <td class="py-2 pr-4">
                  {{ v.publishedAt ? formatDay(v.publishedAt) : '' }}
                </td>
                <td class="py-2 text-right tabular-nums">{{ formatCount(v.rowCount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <section v-if="data.notesMd" aria-labelledby="notes-heading" class="space-y-4">
      <h2 id="notes-heading" class="font-display text-2xl font-medium text-heading">Notes</h2>
      <MarkdownView :source="data.notesMd" :shift="2" />
    </section>
  </article>
</template>
