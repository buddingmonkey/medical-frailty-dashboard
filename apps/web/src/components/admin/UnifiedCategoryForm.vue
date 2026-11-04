<script setup lang="ts">
import {
  type CcsrCategoryListResponse,
  federalCategories,
  federalCategoryInfo,
  type UnifiedCategoryBody,
  unifiedCategoryBodySchema,
  type UnifiedListItem,
  unifiedSlugFromLabel,
  unifiedStatusChangeAllowed,
  unifiedStatuses,
} from '@mfcd/shared'
import { computed, reactive, ref, useId, watch } from 'vue'

import { unifiedStatusLabels } from '../../lib/admin-unified'
import CcsrPicker from './CcsrPicker.vue'

const props = defineProps<{
  /** The category being edited; omit to create one. */
  item?: UnifiedListItem
  ccsrOptions: readonly CcsrCategoryListResponse['items'][number][]
  saving?: boolean
  /** The API's answer when a save failed (e.g. a slug clash). */
  serverError?: string | null
}>()

const emit = defineEmits<{
  save: [body: UnifiedCategoryBody]
  cancel: []
}>()

const id = useId()
const title = computed(() => (props.item ? `Edit ${props.item.label}` : 'New unified category'))

const draft = reactive({
  label: props.item?.label ?? '',
  slug: props.item?.slug ?? '',
  definition: props.item?.definition ?? '',
  includes: props.item?.includes ?? '',
  excludes: props.item?.excludes ?? '',
  federalCategory: props.item?.federalCategory ?? '',
  status: props.item?.status ?? 'draft',
  sortOrder: String(props.item?.sortOrder ?? 0),
  ccsr: [...(props.item?.ccsr ?? [])],
})

// A new category's slug follows its label until the admin edits the slug.
const slugEdited = ref(props.item !== undefined)
watch(
  () => draft.label,
  (label) => {
    if (!slugEdited.value) draft.slug = unifiedSlugFromLabel(label)
  },
)

const parents = federalCategories.filter((c) => c !== 'unmapped')
const statuses = computed(() =>
  unifiedStatuses.filter((s) =>
    props.item ? unifiedStatusChangeAllowed(props.item.status, s) : s !== 'retired',
  ),
)

const fieldLabels: Record<string, string> = {
  label: 'Label',
  slug: 'Slug',
  definition: 'Definition',
  includes: 'Includes',
  excludes: 'Excludes',
  federalCategory: 'Federal parent',
  status: 'Status',
  sortOrder: 'Sort order',
  ccsr: 'CCSR groups',
}
/** Fields that failed the last Save; each is marked aria-invalid and points at the message. */
const invalid = ref<ReadonlySet<string>>(new Set())
const problems = computed(() =>
  Object.keys(fieldLabels)
    .filter((f) => invalid.value.has(f))
    .map((f) => fieldLabels[f] ?? f),
)
const problemsId = `${id}-problems`
/** aria-invalid, and aria-describedby with the message first (M8 step 2). */
function fieldState(field: string, help?: string) {
  const describedBy = [invalid.value.has(field) ? problemsId : '', help ?? '']
    .filter((x) => x !== '')
    .join(' ')
  return {
    'aria-invalid': invalid.value.has(field) ? ('true' as const) : undefined,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
  }
}

function submit() {
  const blankToNull = (s: string) => (s.trim() === '' ? null : s)
  const result = unifiedCategoryBodySchema.safeParse({
    label: draft.label,
    slug: draft.slug,
    definition: draft.definition,
    includes: blankToNull(draft.includes),
    excludes: blankToNull(draft.excludes),
    federalCategory: draft.federalCategory,
    status: draft.status,
    sortOrder: draft.sortOrder.trim() === '' ? Number.NaN : Number(draft.sortOrder),
    ccsr: draft.ccsr,
  })
  if (!result.success) {
    invalid.value = new Set(result.error.issues.map((issue) => String(issue.path[0])))
    return
  }
  invalid.value = new Set()
  emit('save', result.data)
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
</script>

<template>
  <form
    class="space-y-4 rounded border border-border p-4"
    :aria-label="title"
    novalidate
    @submit.prevent="submit"
  >
    <h3 class="font-display text-xl font-medium text-heading">{{ title }}</h3>

    <div
      v-if="problems.length > 0 || serverError"
      :id="problemsId"
      role="alert"
      class="space-y-1 text-danger"
    >
      <p v-if="problems.length > 0">Fix these fields: {{ problems.join(', ') }}.</p>
      <p v-if="serverError">Could not save: {{ serverError }}</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label :for="`${id}-label`" class="font-medium">Label</label>
        <input
          :id="`${id}-label`"
          v-model="draft.label"
          type="text"
          :class="inputClass"
          v-bind="fieldState('label')"
        />
      </div>
      <div>
        <label :for="`${id}-slug`" class="font-medium"
          >Slug <span class="font-normal text-muted-foreground">(URL: /compare/…)</span></label
        >
        <input
          :id="`${id}-slug`"
          v-model="draft.slug"
          type="text"
          :class="inputClass"
          v-bind="fieldState('slug', `${id}-slug-help`)"
          @input="slugEdited = true"
        />
        <p :id="`${id}-slug-help`" class="mt-1 text-sm text-muted-foreground">
          Lowercase letters, digits and hyphens. Must be unique.
        </p>
      </div>
    </div>

    <div>
      <label :for="`${id}-definition`" class="font-medium">Definition</label>
      <textarea
        :id="`${id}-definition`"
        v-model="draft.definition"
        rows="3"
        :class="inputClass"
        v-bind="fieldState('definition')"
      />
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label :for="`${id}-includes`" class="font-medium">Includes</label>
        <textarea
          :id="`${id}-includes`"
          v-model="draft.includes"
          rows="2"
          :class="inputClass"
          v-bind="fieldState('includes')"
        />
      </div>
      <div>
        <label :for="`${id}-excludes`" class="font-medium">Excludes</label>
        <textarea
          :id="`${id}-excludes`"
          v-model="draft.excludes"
          rows="2"
          :class="inputClass"
          v-bind="fieldState('excludes')"
        />
      </div>
    </div>

    <div class="flex flex-wrap gap-4">
      <div>
        <label :for="`${id}-parent`" class="font-medium">Federal parent</label>
        <select
          :id="`${id}-parent`"
          v-model="draft.federalCategory"
          :class="inputClass"
          v-bind="fieldState('federalCategory')"
        >
          <option value="" disabled>Choose</option>
          <option v-for="p in parents" :key="p" :value="p">
            {{ federalCategoryInfo[p].label }}
          </option>
        </select>
      </div>
      <div>
        <label :for="`${id}-status`" class="font-medium">Status</label>
        <select
          :id="`${id}-status`"
          v-model="draft.status"
          :class="inputClass"
          v-bind="fieldState('status')"
        >
          <option v-for="s in statuses" :key="s" :value="s">{{ unifiedStatusLabels[s] }}</option>
        </select>
      </div>
      <div>
        <label :for="`${id}-sort`" class="font-medium">Sort order</label>
        <input
          :id="`${id}-sort`"
          v-model="draft.sortOrder"
          type="text"
          inputmode="numeric"
          :class="inputClass"
          v-bind="fieldState('sortOrder')"
        />
      </div>
    </div>
    <p v-if="item && item.status !== 'draft'" class="text-sm text-muted-foreground">
      Once out of draft, a category cannot go back to draft; retire it instead.
    </p>
    <p v-else-if="item" class="text-sm text-muted-foreground">
      A draft that will not be published can be retired.
    </p>

    <CcsrPicker v-model="draft.ccsr" :options="ccsrOptions" />

    <div class="flex gap-2">
      <button
        type="submit"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="saving"
      >
        Save
      </button>
      <button
        type="button"
        class="rounded border border-border px-4 py-2 hover:bg-surface"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </form>
</template>
