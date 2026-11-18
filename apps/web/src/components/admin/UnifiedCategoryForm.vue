<script setup lang="ts">
import {
  type CcsrCategoryListResponse,
  federalCategories,
  federalCategoryInfo,
  isReservedUnifiedSlug,
  type UnifiedCategoryBody,
  unifiedCategoryBodySchema,
  type UnifiedListItem,
  unifiedSlugFromLabel,
  unifiedStatusChangeAllowed,
  unifiedStatuses,
} from '@mfcd/shared'
import { computed, reactive, ref, useId, watch } from 'vue'

import { unifiedStatusLabels } from '../../lib/admin-unified'
import InfoTip from '../ui/InfoTip.vue'
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
/** What a field changes, in its info button's tooltip; fields with a visible hint have none. */
const fieldHelp = {
  label: 'The category name shown on public pages.',
  definition: 'A short description, shown under the category name on public pages.',
  federalCategory:
    'The federal exemption category this category belongs to. Its codes are counted under that federal category on public pages.',
  sortOrder: 'A lower number is shown first. Must be a whole number between 0 and 100,000.',
  ccsr: 'The CCSR groups decide which ICD-10-CM codes are in the category. A change recounts coverage for every state.',
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
      <p v-if="invalid.has('slug') && isReservedUnifiedSlug(draft.slug)">
        The slug “{{ draft.slug }}” is reserved for another page. Choose a different slug.
      </p>
      <p v-if="serverError">The category was not saved: {{ serverError }}</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label :for="`${id}-label`" class="font-medium">Label</label
        ><InfoTip label="Label" :text="fieldHelp.label" />
        <input
          :id="`${id}-label`"
          v-model="draft.label"
          maxlength="200"
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
          maxlength="80"
          type="text"
          :class="inputClass"
          v-bind="fieldState('slug', `${id}-slug-help`)"
          @input="slugEdited = true"
        />
        <p :id="`${id}-slug-help`" class="mt-1 text-sm text-muted-foreground">
          Use lowercase letters, digits and hyphens only. The slug must be unique.
        </p>
      </div>
    </div>

    <div>
      <label :for="`${id}-definition`" class="font-medium">Definition</label
      ><InfoTip label="Definition" :text="fieldHelp.definition" />
      <textarea
        :id="`${id}-definition`"
        v-model="draft.definition"
        maxlength="4000"
        rows="3"
        :class="inputClass"
        v-bind="fieldState('definition')"
      />
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label :for="`${id}-includes`" class="font-medium"
          >Includes <span class="font-normal text-muted-foreground">(optional)</span></label
        >
        <textarea
          :id="`${id}-includes`"
          v-model="draft.includes"
          maxlength="4000"
          rows="2"
          :class="inputClass"
          v-bind="fieldState('includes', `${id}-text-help`)"
        />
      </div>
      <div>
        <label :for="`${id}-excludes`" class="font-medium"
          >Excludes <span class="font-normal text-muted-foreground">(optional)</span></label
        >
        <textarea
          :id="`${id}-excludes`"
          v-model="draft.excludes"
          maxlength="4000"
          rows="2"
          :class="inputClass"
          v-bind="fieldState('excludes', `${id}-text-help`)"
        />
      </div>
      <p :id="`${id}-text-help`" class="-mt-2 text-sm text-muted-foreground md:col-span-2">
        Includes and Excludes are descriptive text only. The CCSR groups decide which codes are in
        the category.
      </p>
    </div>

    <div class="flex flex-wrap gap-4">
      <div>
        <label :for="`${id}-parent`" class="font-medium">Federal parent</label
        ><InfoTip label="Federal parent" :text="fieldHelp.federalCategory" />
        <select
          :id="`${id}-parent`"
          v-model="draft.federalCategory"
          :class="inputClass"
          v-bind="fieldState('federalCategory')"
        >
          <option value="" disabled>Choose a federal category</option>
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
          v-bind="fieldState('status', `${id}-status-help`)"
        >
          <option v-for="s in statuses" :key="s" :value="s">{{ unifiedStatusLabels[s] }}</option>
        </select>
      </div>
      <div>
        <label :for="`${id}-sort`" class="font-medium">Sort order</label
        ><InfoTip label="Sort order" :text="fieldHelp.sortOrder" />
        <input
          :id="`${id}-sort`"
          :value="draft.sortOrder"
          type="number"
          min="0"
          max="100000"
          step="1"
          :class="inputClass"
          v-bind="fieldState('sortOrder')"
          @input="draft.sortOrder = ($event.target as HTMLInputElement).value"
        />
      </div>
    </div>
    <p :id="`${id}-status-help`" class="text-sm text-muted-foreground">
      Draft and retired categories are not shown on public pages. A published category cannot return
      to draft; retire it instead.
    </p>

    <CcsrPicker v-model="draft.ccsr" :options="ccsrOptions" :help="fieldHelp.ccsr" />

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
