<script setup lang="ts">
import {
  type CodeDetailState,
  codeSystemLabels,
  formatDay,
  LIKE_CODES,
  likeCodeGroupsText,
  likeCodeMoreText,
  stateCategoryName,
} from '@mfcd/shared'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

// Like codes on the code detail page (roadmap M6 step 4; docs/data-model.md, "Like codes"):
// states that do not list the code but list a code in another code system in the same condition
// group. Kept in a section of its own, so a like match never reads as a confirmed one. Wording
// lives in packages/shared/src/condition-groups.ts.

const props = defineProps<{
  states: readonly CodeDetailState[]
  groups: readonly { slug: string; name: string }[]
}>()

/** Per state with like codes: one row per entry, plus a row counting the entries left out. */
const byState = computed(() =>
  props.states
    .map((s) => ({
      s,
      rows: (s.likeCodes ?? []).flatMap((match) => [
        ...match.entries.map((entry, i) => ({
          key: `${match.group.slug}-${String(i)}`,
          match,
          entry,
        })),
        ...(match.total > match.entries.length
          ? [{ key: `${match.group.slug}-more`, match, entry: null }]
          : []),
      ]),
    }))
    .filter((x) => x.rows.length > 0),
)
</script>

<template>
  <section v-if="byState.length > 0" aria-labelledby="like-codes-heading" class="space-y-4">
    <div class="max-w-prose space-y-1">
      <h2 id="like-codes-heading" class="font-display text-2xl font-medium text-heading">
        {{ LIKE_CODES.heading }}
      </h2>
      <p>{{ LIKE_CODES.help }}</p>
      <p class="text-sm">{{ likeCodeGroupsText(groups.map((g) => g.name)) }}</p>
      <p class="text-sm text-muted-foreground">{{ LIKE_CODES.note }}</p>
    </div>

    <div class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          {{
            LIKE_CODES.heading
          }}
        </caption>
        <thead class="bg-surface">
          <tr>
            <th scope="col" class="px-3 py-2">State</th>
            <th scope="col" class="px-3 py-2">Condition group</th>
            <th scope="col" class="px-3 py-2">State’s code</th>
            <th scope="col" class="min-w-48 px-3 py-2">State’s description</th>
            <th scope="col" class="px-3 py-2">State’s category</th>
            <th scope="col" class="min-w-40 px-3 py-2">Source</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="{ s, rows } in byState" :key="s.id">
            <tr v-for="(r, i) in rows" :key="r.key" class="border-t border-border align-top">
              <th v-if="i === 0" scope="row" :rowspan="rows.length" class="px-3 py-2 font-semibold">
                <RouterLink :to="`/states/${s.slug}`" class="text-link">{{ s.name }}</RouterLink>
              </th>
              <td class="px-3 py-2">{{ r.match.group.name }}</td>
              <template v-if="r.entry">
                <td class="px-3 py-2 whitespace-nowrap">
                  <span class="font-mono">{{ r.entry.display }}</span>
                  <span class="block text-xs text-muted-foreground">{{
                    codeSystemLabels[r.entry.codeSystem]
                  }}</span>
                </td>
                <td class="px-3 py-2">
                  <template v-if="r.entry.description">{{ r.entry.description }}</template>
                  <span v-else class="text-muted-foreground">No description published</span>
                </td>
                <td class="px-3 py-2">
                  {{ stateCategoryName(r.entry.stateCategory, r.entry.stateSubcategory) }}
                </td>
                <td class="px-3 py-2">
                  <a
                    v-if="r.entry.source.url"
                    :href="r.entry.source.url"
                    class="text-link"
                    rel="noopener noreferrer external"
                    target="_blank"
                    >{{ r.entry.source.title }}</a
                  >
                  <template v-else>{{ r.entry.source.title }}</template>
                  <span v-if="r.entry.source.publisherDate" class="block text-xs">{{
                    formatDay(r.entry.source.publisherDate)
                  }}</span>
                  <span v-if="r.entry.source.locator" class="block text-xs">{{
                    r.entry.source.locator
                  }}</span>
                </td>
              </template>
              <td v-else colspan="4" class="px-3 py-2 text-muted-foreground">
                {{ likeCodeMoreText(r.match.total - r.match.entries.length) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>
