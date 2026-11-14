<script setup lang="ts">
import {
  type ChosenFederalCategory,
  type FederalCategory,
  federalCategories,
  federalCategoriesText,
  federalCategoryInfo,
  type RemapChanges,
  stateCategoriesResponseSchema,
  type StateCategories,
  stateListResponseSchema,
} from '@mfcd/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import { z } from 'zod'

import RemapPreview from '../../components/admin/RemapPreview.vue'
import SuggestionRun from '../../components/admin/SuggestionRun.vue'
import { formatTimestampDate } from '../../lib/admin-watch'
import { getJson, sendJson } from '../../lib/api'

// Category mapping (roadmap M2 step 9; docs/ingestion.md, "Category auto-mapping"): each state
// category gets a federal category, used for its entries placed in no unified category (M5
// step 5b: placed entries follow the unified categories' federal parents). Publish stores the keyword table's guess as "auto"; an
// admin confirms it here (launch needs every mapping confirmed). States that group codes only
// by ICD-10-CM chapter (NE, GA) can override by chapter. Bulk remap (M7 step 3): select rows,
// choose one federal category (or chapter override), check the server's preview, then save.
// Suggestions by code (project lead, 2026-11-13): entries whose federal category comes from
// another state's per-code list; confirmed per state category, re-run with a preview.
type Category = StateCategories['categories'][number]
type Chapter = StateCategories['chapters'][number]

const id = useId()
const queryClient = useQueryClient()
const statesQuery = useQuery({
  queryKey: ['admin', 'states'],
  queryFn: async () => (await getJson('/api/admin/states', stateListResponseSchema)).items,
  staleTime: Infinity,
})
const stateId = ref('')
const stateName = computed(
  () => statesQuery.data.value?.find((s) => s.id === stateId.value)?.name ?? '',
)
const query = useQuery({
  queryKey: computed(() => ['admin', 'categories', stateId.value]),
  queryFn: () =>
    getJson(`/api/admin/states/${stateId.value}/categories`, stateCategoriesResponseSchema),
  enabled: computed(() => stateId.value !== ''),
})

const choices = federalCategories.filter((c) => c !== 'unmapped')
const label = (c: FederalCategory) => federalCategoryInfo[c].label
const nameOf = (c: { stateCategory: string; stateSubcategory: string }) =>
  [c.stateCategory || '(no category)', c.stateSubcategory].filter(Boolean).join(' / ')
const keyOf = (c: { stateCategory: string; stateSubcategory: string }) =>
  `${c.stateCategory}\u0000${c.stateSubcategory}`

// The select of each row starts at its mapping, else the guess.
const picked = reactive<Record<string, FederalCategory | ''>>({})
const chapterPicked = reactive<Record<number, FederalCategory | ''>>({})
watch(
  () => query.data.value,
  (data) => {
    for (const c of data?.categories ?? []) {
      const current = c.mapping?.federalCategory ?? c.suggestion?.federalCategory ?? ''
      picked[keyOf(c)] = current === 'unmapped' ? '' : current
    }
    for (const ch of data?.chapters ?? [])
      chapterPicked[ch.chapter] = ch.override?.federalCategory ?? ''
  },
  { immediate: true },
)

const categories = computed(() => query.data.value?.categories ?? [])
// A confirm saves at once when it moves no published entry (M7 step 3): a stored mapping
// confirmed unchanged, or any choice for a category with no published entries (draft only).
// Any other change goes through the preview. The API checks the same rule.
const isConfirmOnly = (c: Category, choice: FederalCategory | '') =>
  choice !== '' &&
  choice !== 'unmapped' &&
  (c.publishedEntries === 0 || c.mapping?.federalCategory === choice)
/** The guess "Confirm all guesses" saves for a category, or null when it has none to confirm. */
function guessOf(c: Category): ChosenFederalCategory | null {
  if (c.mapping?.method === 'manual') return null
  const guess = c.mapping?.federalCategory ?? c.suggestion?.federalCategory ?? 'unmapped'
  return guess !== 'unmapped' && isConfirmOnly(c, guess) ? guess : null
}
// A suggestion for a category with published entries and no stored mapping counts as not
// mapped (its entries are unmapped now); confirming it is a change, previewed per row.
const guesses = computed(() => categories.value.filter((c) => guessOf(c) !== null))
/** Categories with entries that follow an unreviewed suggestion by code. */
const pendingSuggestions = computed(() =>
  categories.value.filter((c) => c.codeSuggested.pending > 0),
)
/** What "Confirm all guesses" confirms: the guessed mappings and the pending suggestions. */
const allGuesses = computed(
  () => new Set([...guesses.value, ...pendingSuggestions.value].map(keyOf)).size,
)
const summary = computed(() => {
  const confirmed = categories.value.filter((c) => c.mapping?.method === 'manual').length
  const guessed = guesses.value.length
  const unmapped = categories.value.length - confirmed - guessed
  return `${String(categories.value.length)} ${categories.value.length === 1 ? 'category' : 'categories'}: ${String(confirmed)} confirmed, ${String(guessed)} guessed, ${String(unmapped)} not mapped.`
})
const chapters = computed(() =>
  (query.data.value?.chapters ?? []).filter(
    (ch) => ch.publishedEntries + ch.draftEntries > 0 || ch.override !== null,
  ),
)

function status(c: Category): string {
  const m = c.mapping
  if (m?.method === 'manual') {
    return `Confirmed by ${m.mappedBy ?? 'an admin'}${m.mappedAt ? ` on ${formatTimestampDate(m.mappedAt)}` : ''}`
  }
  const guess = c.suggestion
  if (m || guess) {
    const keyword = guess ? `Guessed from “${guess.keyword}”` : 'Guessed'
    const confidence = m?.confidence ?? guess?.confidence
    return confidence === undefined
      ? keyword
      : `${keyword} (${String(Math.round(confidence * 100))}% sure)`
  }
  return 'Not mapped'
}

// Bulk remap (M7 step 3): selected rows, the one choice for them, and the open preview.
const selected = ref(new Set<string>())
const selectedChapters = ref(new Set<number>())
const bulkCategory = ref<ChosenFederalCategory | ''>('')
const bulkChapter = ref<ChosenFederalCategory | 'clear' | ''>('')
const remap = ref<{ changes: RemapChanges; from: 'categories' | 'chapters'; n: number } | null>(
  null,
)
let remapCount = 0
let opener: HTMLElement | null = null
function openRemap(from: 'categories' | 'chapters', changes: RemapChanges) {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  remapCount += 1
  remap.value = { from, n: remapCount, changes }
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}
const toggleCategory = (key: string) => (selected.value = toggled(selected.value, key))
const toggleChapter = (chapter: number) =>
  (selectedChapters.value = toggled(selectedChapters.value, chapter))
const allSelected = computed(
  () => categories.value.length > 0 && selected.value.size === categories.value.length,
)
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(categories.value.map(keyOf))
}
const allChaptersSelected = computed(
  () => chapters.value.length > 0 && selectedChapters.value.size === chapters.value.length,
)
function toggleAllChapters() {
  selectedChapters.value = allChaptersSelected.value
    ? new Set()
    : new Set(chapters.value.map((ch) => ch.chapter))
}

function previewCategories() {
  const to = bulkCategory.value
  if (!to) return
  const items = categories.value.filter((c) => selected.value.has(keyOf(c)))
  openRemap('categories', {
    categories: items.map((c) => ({
      stateCategory: c.stateCategory,
      stateSubcategory: c.stateSubcategory,
      federalCategory: to,
    })),
    chapters: [],
  })
}
function previewChapters() {
  const to = bulkChapter.value
  if (!to) return
  openRemap('chapters', {
    categories: [],
    chapters: chapters.value
      .filter((ch) => selectedChapters.value.has(ch.chapter))
      .map((ch) => ({ chapter: ch.chapter, federalCategory: to === 'clear' ? null : to })),
  })
}
async function closeRemap() {
  remap.value = null
  await nextTick()
  opener?.focus()
}
async function remapSaved(message: string) {
  if (remap.value?.from === 'chapters') selectedChapters.value = new Set()
  else selected.value = new Set()
  remap.value = null
  saved.value = message
  await queryClient.invalidateQueries({ queryKey: ['admin', 'categories', stateId.value] })
}

const saved = ref<string | null>(null)
watch(stateId, () => {
  saved.value = null
  selected.value = new Set()
  selectedChapters.value = new Set()
  remap.value = null
  rerun.value = null
})

// "Re-run automatic suggestions": the preview panel, keyed so each opening fetches afresh.
const rerun = ref<number | null>(null)
let rerunCount = 0
let rerunOpener: HTMLElement | null = null
function openRerun() {
  rerunOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  rerunCount += 1
  rerun.value = rerunCount
}
async function closeRerun() {
  rerun.value = null
  await nextTick()
  rerunOpener?.focus()
}
async function rerunSaved(message: string) {
  rerun.value = null
  saved.value = message
  await queryClient.invalidateQueries({ queryKey: ['admin', 'categories', stateId.value] })
}
const ok = z.object({ ok: z.literal(true) })
const confirmedSuggestions = z.object({ ok: z.literal(true), confirmed: z.number().int() })
const categoryItem = (c: Category) => ({
  stateCategory: c.stateCategory,
  stateSubcategory: c.stateSubcategory,
})
const postConfirmSuggestions = (items: { stateCategory: string; stateSubcategory: string }[]) =>
  sendJson(
    'POST',
    `/api/admin/states/${stateId.value}/categories/suggestions/confirm`,
    { items },
    confirmedSuggestions,
  )

const confirmSuggestions = useMutation({
  mutationFn: (c: Category) => postConfirmSuggestions([categoryItem(c)]),
  onSuccess: async (result, c) => {
    saved.value = `Confirmed ${String(result.confirmed)} ${result.confirmed === 1 ? 'suggestion' : 'suggestions'} for ${nameOf(c)}.`
    await queryClient.invalidateQueries({ queryKey: ['admin', 'categories', stateId.value] })
  },
})
const suggestedText = (c: Category) =>
  `${n(c.codeSuggested.entries)} suggested from ${
    c.codeSuggested.referenceNames.length > 0
      ? `${c.codeSuggested.referenceNames.join(' and ')}’s list`
      : 'another state’s list'
  }: ${federalCategoriesText(c.codeSuggested.federal)}${
    c.codeSuggested.pending > 0 ? ` (${n(c.codeSuggested.pending)} not reviewed)` : ''
  }`

const save = useMutation({
  mutationFn: (
    items: { stateCategory: string; stateSubcategory: string; federalCategory: FederalCategory }[],
  ) => sendJson('PUT', `/api/admin/states/${stateId.value}/categories`, { items }, ok),
  onSuccess: async (_, items) => {
    saved.value =
      items.length === 1 && items[0]
        ? `Confirmed ${nameOf(items[0])} as ${label(items[0].federalCategory)}.`
        : `Confirmed ${String(items.length)} categories.`
    await queryClient.invalidateQueries({ queryKey: ['admin', 'categories', stateId.value] })
  },
})

/** One row's choice: a confirm saves at once; a change is previewed as a one-item remap. */
function confirmOne(c: Category) {
  const choice = picked[keyOf(c)]
  if (!choice || choice === 'unmapped') return
  const item = {
    stateCategory: c.stateCategory,
    stateSubcategory: c.stateSubcategory,
    federalCategory: choice,
  }
  if (isConfirmOnly(c, choice)) save.mutate([item])
  else openRemap('categories', { categories: [item], chapters: [] })
}

const guessItems = () =>
  guesses.value.slice(0, 200).flatMap((c) => {
    const federalCategory = guessOf(c)
    return federalCategory
      ? [{ stateCategory: c.stateCategory, stateSubcategory: c.stateSubcategory, federalCategory }]
      : []
  })

// "Confirm all guesses": the pending suggestions by code first, then the guessed mappings
// (whose own suggestions the server confirms with them).
const confirmAll = useMutation({
  mutationFn: async () => {
    const pending = pendingSuggestions.value.slice(0, 200).map(categoryItem)
    if (pending.length > 0) await postConfirmSuggestions(pending)
    const items = guessItems()
    if (items.length > 0) {
      await sendJson('PUT', `/api/admin/states/${stateId.value}/categories`, { items }, ok)
    }
    return new Set([...pending, ...items].map(keyOf)).size
  },
  onSuccess: async (count) => {
    saved.value = `Confirmed ${String(count)} ${count === 1 ? 'category' : 'categories'}.`
    await queryClient.invalidateQueries({ queryKey: ['admin', 'categories', stateId.value] })
  },
})
const busy = computed(
  () => save.isPending.value || confirmAll.isPending.value || confirmSuggestions.isPending.value,
)
const saveError = computed(
  () => save.error.value ?? confirmAll.error.value ?? confirmSuggestions.error.value,
)

const chapterChanged = (ch: Chapter) =>
  (chapterPicked[ch.chapter] ?? '') !== (ch.override?.federalCategory ?? '')
function previewChapter(ch: Chapter) {
  const choice = chapterPicked[ch.chapter] ?? ''
  if (choice === 'unmapped') return
  openRemap('chapters', {
    categories: [],
    chapters: [{ chapter: ch.chapter, federalCategory: choice === '' ? null : choice }],
  })
}

const n = (value: number) => value.toLocaleString('en-US')
const selectClass = 'rounded border border-input-border bg-background px-2 py-1'
const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Federal categories</h2>
      <p class="max-w-prose text-muted-foreground">
        Each state names its own categories. When the state’s list names a federal category for a
        code, the code counts under that one (“stated by the state”), and nothing here changes it.
        Otherwise a code in a published unified category counts under that unified category’s
        federal category. For codes in no unified category, map each state category to one of the
        H.R.1 federal categories here.
      </p>
      <p class="max-w-prose text-muted-foreground">
        When a list is published, a new state category whose name matches a keyword gets a guessed
        federal category. The public pages use the guess right away for codes in no unified
        category, marked “Not yet reviewed”. Read each guess and click Confirm, or confirm them all
        at once. A change that moves published codes shows a preview before it is saved.
      </p>
      <p class="max-w-prose text-muted-foreground">
        When another state’s list names a federal category for each code (Indiana does), publishing
        suggests one for this state’s ICD-10-CM codes: the same code’s, else the most common one for
        codes starting with the same three characters, else the chapter’s when nearly all of it
        agrees. A suggestion wins over a guessed mapping, not over a confirmed one. Confirm a
        category’s suggestions, or re-run them after that state’s list changes.
      </p>
    </div>
    <div class="max-w-xs">
      <label :for="`${id}-state`" class="font-medium">State</label>
      <select
        :id="`${id}-state`"
        v-model="stateId"
        class="mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5"
      >
        <option value="" disabled>Choose a state</option>
        <option v-for="s in statesQuery.data.value ?? []" :key="s.id" :value="s.id">
          {{ s.name }}
        </option>
      </select>
    </div>

    <p v-if="saved" role="status" class="font-medium">{{ saved }}</p>
    <p v-if="saveError" role="alert" class="text-danger">Could not save: {{ saveError.message }}</p>
    <p v-if="query.error.value" role="alert" class="text-danger">
      Could not load the categories: {{ query.error.value.message }}
    </p>

    <template v-if="stateId && query.data.value">
      <p v-if="categories.length === 0" class="text-muted-foreground">
        {{ stateName }} has no rows yet. Send a list to a draft first.
      </p>
      <template v-else>
        <div class="flex flex-wrap items-center gap-3">
          <p>{{ summary }}</p>
          <button
            v-if="allGuesses > 0"
            type="button"
            :class="smallButton"
            :disabled="busy"
            @click="confirmAll.mutate()"
          >
            Confirm all {{ allGuesses }} guesses
          </button>
          <button type="button" :class="smallButton" :disabled="rerun !== null" @click="openRerun">
            Re-run automatic suggestions
          </button>
        </div>
        <SuggestionRun
          v-if="rerun !== null"
          :key="rerun"
          :state-id="stateId"
          :state-name="stateName"
          @saved="rerunSaved"
          @cancel="closeRerun"
        />
        <fieldset class="flex flex-wrap items-center gap-3 rounded border border-border p-3">
          <legend class="px-1 font-medium">Remap several categories</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="selected.size > 0 && !allSelected"
              @change="toggleAll"
            />
            Select all {{ categories.length }} categories of {{ stateName }}
          </label>
          <span aria-live="polite">{{ selected.size }} selected</span>
          <label :for="`${id}-bulk`" class="sr-only"
            >Federal category for the selected categories</label
          >
          <select :id="`${id}-bulk`" v-model="bulkCategory" :class="selectClass">
            <option value="" disabled>Choose a federal category</option>
            <option v-for="f in choices" :key="f" :value="f">{{ label(f) }}</option>
          </select>
          <button
            type="button"
            :class="smallButton"
            :disabled="selected.size === 0 || !bulkCategory"
            @click="previewCategories"
          >
            Preview remap
          </button>
        </fieldset>
        <RemapPreview
          v-if="remap && remap.from === 'categories'"
          :key="remap.n"
          :state-id="stateId"
          :state-name="stateName"
          :changes="remap.changes"
          @saved="remapSaved"
          @cancel="closeRemap"
        />
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              Categories of
              {{
                stateName
              }}
            </caption>
            <thead class="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" class="py-2 pr-2 font-medium">
                  <span class="sr-only">Select</span>
                </th>
                <th scope="col" class="py-2 pr-4 font-medium">State category</th>
                <th scope="col" class="py-2 pr-4 text-right font-medium">Entries</th>
                <th scope="col" class="py-2 pr-4 font-medium">Now</th>
                <th scope="col" class="py-2 font-medium">Federal category</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(c, i) in categories"
                :key="keyOf(c)"
                class="border-b border-border align-top"
              >
                <td class="py-2 pr-2">
                  <input
                    type="checkbox"
                    :aria-label="`Select ${nameOf(c)}`"
                    :checked="selected.has(keyOf(c))"
                    @change="toggleCategory(keyOf(c))"
                  />
                </td>
                <th scope="row" class="py-2 pr-4 font-medium">{{ nameOf(c) }}</th>
                <td class="py-2 pr-4 text-right">
                  {{ n(c.publishedEntries) }}
                  <span v-if="c.draftEntries > 0" class="block text-xs text-muted-foreground"
                    >{{ n(c.draftEntries) }} in drafts</span
                  >
                  <span v-if="c.statedEntries > 0" class="block text-xs text-muted-foreground"
                    >{{ n(c.statedEntries) }} stated by the state:
                    {{ federalCategoriesText(c.statedFederal) }}</span
                  >
                  <span v-if="c.placedEntries > 0" class="block text-xs text-muted-foreground"
                    >{{ n(c.placedEntries) }} follow their unified categories:
                    {{ federalCategoriesText(c.placedFederal) }}</span
                  >
                  <span
                    v-if="c.codeSuggested.entries > 0"
                    class="block text-xs text-muted-foreground"
                    >{{ suggestedText(c) }}</span
                  >
                  <button
                    v-if="c.codeSuggested.pending > 0"
                    type="button"
                    class="mt-1 rounded border border-border px-2 py-0.5 text-xs hover:bg-surface"
                    :disabled="busy"
                    :aria-label="`Confirm suggestions for ${nameOf(c)}`"
                    @click="confirmSuggestions.mutate(c)"
                  >
                    Confirm suggestions
                  </button>
                </td>
                <td class="py-2 pr-4">
                  <span v-if="c.mapping" class="block">{{ label(c.mapping.federalCategory) }}</span>
                  <span class="block text-xs text-muted-foreground">{{ status(c) }}</span>
                </td>
                <td class="py-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <label :for="`${id}-c-${i}`" class="sr-only"
                      >Federal category for {{ nameOf(c) }}</label
                    >
                    <select :id="`${id}-c-${i}`" v-model="picked[keyOf(c)]" :class="selectClass">
                      <option value="" disabled>Choose</option>
                      <option v-for="f in choices" :key="f" :value="f">{{ label(f) }}</option>
                    </select>
                    <button
                      type="button"
                      :class="smallButton"
                      :disabled="!picked[keyOf(c)] || busy"
                      :aria-label="
                        isConfirmOnly(c, picked[keyOf(c)] ?? '')
                          ? `Confirm ${nameOf(c)}`
                          : `Preview change for ${nameOf(c)}`
                      "
                      @click="confirmOne(c)"
                    >
                      {{ isConfirmOnly(c, picked[keyOf(c)] ?? '') ? 'Confirm' : 'Preview change' }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <section v-if="chapters.length > 0" class="space-y-3" :aria-labelledby="`${id}-ch`">
        <h3 :id="`${id}-ch`" class="font-display text-xl font-medium text-heading">
          Override by ICD-10-CM chapter
        </h3>
        <p class="max-w-prose text-muted-foreground">
          For states that group codes only by chapter (Nebraska, Georgia). An override wins over the
          category mapping for the ICD-10-CM codes in that chapter.
        </p>
        <fieldset class="flex flex-wrap items-center gap-3 rounded border border-border p-3">
          <legend class="px-1 font-medium">Override several chapters</legend>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              :checked="allChaptersSelected"
              :indeterminate="selectedChapters.size > 0 && !allChaptersSelected"
              @change="toggleAllChapters"
            />
            Select all {{ chapters.length }} chapters
          </label>
          <span aria-live="polite">{{ selectedChapters.size }} chapters selected</span>
          <label :for="`${id}-bulk-ch`" class="sr-only">Override for the selected chapters</label>
          <select :id="`${id}-bulk-ch`" v-model="bulkChapter" :class="selectClass">
            <option value="" disabled>Choose an override</option>
            <option value="clear">Use the category mapping</option>
            <option v-for="f in choices" :key="f" :value="f">{{ label(f) }}</option>
          </select>
          <button
            type="button"
            :class="smallButton"
            :disabled="selectedChapters.size === 0 || !bulkChapter"
            @click="previewChapters"
          >
            Preview chapter overrides
          </button>
        </fieldset>
        <RemapPreview
          v-if="remap && remap.from === 'chapters'"
          :key="remap.n"
          :state-id="stateId"
          :state-name="stateName"
          :changes="remap.changes"
          @saved="remapSaved"
          @cancel="closeRemap"
        />
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-left text-sm">
            <caption class="sr-only">
              ICD-10-CM chapters
            </caption>
            <thead class="border-b border-border text-muted-foreground">
              <tr>
                <th scope="col" class="py-2 pr-2 font-medium">
                  <span class="sr-only">Select</span>
                </th>
                <th scope="col" class="py-2 pr-4 font-medium">Chapter</th>
                <th scope="col" class="py-2 pr-4 text-right font-medium">Entries</th>
                <th scope="col" class="py-2 font-medium">Override</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ch in chapters" :key="ch.chapter" class="border-b border-border align-top">
                <td class="py-2 pr-2">
                  <input
                    type="checkbox"
                    :aria-label="`Select chapter ${ch.chapter}`"
                    :checked="selectedChapters.has(ch.chapter)"
                    @change="toggleChapter(ch.chapter)"
                  />
                </td>
                <th scope="row" class="py-2 pr-4 font-medium">{{ ch.chapter }}. {{ ch.title }}</th>
                <td class="py-2 pr-4 text-right">{{ n(ch.publishedEntries + ch.draftEntries) }}</td>
                <td class="py-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <label :for="`${id}-ch-${ch.chapter}`" class="sr-only"
                      >Override for chapter {{ ch.chapter }}</label
                    >
                    <select
                      :id="`${id}-ch-${ch.chapter}`"
                      v-model="chapterPicked[ch.chapter]"
                      :class="selectClass"
                    >
                      <option value="">Use the category mapping</option>
                      <option v-for="f in choices" :key="f" :value="f">{{ label(f) }}</option>
                    </select>
                    <button
                      type="button"
                      :class="smallButton"
                      :disabled="!chapterChanged(ch)"
                      :aria-label="`Preview change for chapter ${ch.chapter}`"
                      @click="previewChapter(ch)"
                    >
                      Preview change
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>
