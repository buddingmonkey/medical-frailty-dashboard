<script setup lang="ts">
import {
  type CodeSystem,
  type ConditionGroup,
  type ConditionGroupBody,
  conditionGroupBodySchema,
  conditionGroupSlugFromName,
  conditionGroupStatusLabels,
  conditionGroupStatuses,
  codeSystemLabels,
  codeSystems,
  parseConditionMember,
} from '@mfcd/shared'
import { computed, reactive, ref, useId, watch } from 'vue'

// Create or edit one condition group (roadmap M6 step 4). A save sends the whole member list.

const props = defineProps<{
  /** The group being edited; omit to create one. */
  item?: ConditionGroup
  saving?: boolean
  /** The API's answer when a save failed. */
  serverError?: string | null
}>()

const emit = defineEmits<{
  save: [body: ConditionGroupBody]
  cancel: []
}>()

const id = useId()
const title = computed(() => (props.item ? `Edit ${props.item.name}` : 'New condition group'))

/** NDCs have no parser yet (codes.ts), so they cannot be members. */
const memberSystems = codeSystems.filter((s) => s !== 'ndc')

let nextKey = 0
const memberRow = (codeSystem: CodeSystem, text: string) => ({ key: nextKey++, codeSystem, text })

const draft = reactive({
  name: props.item?.name ?? '',
  slug: props.item?.slug ?? '',
  definition: props.item?.definition ?? '',
  sources: props.item?.sources ?? '',
  status: props.item?.status ?? 'draft',
  members: (props.item?.members ?? []).map((m) => memberRow(m.codeSystem, m.text)),
})

// A new group's slug follows its name until the admin edits the slug.
const slugEdited = ref(props.item !== undefined)
watch(
  () => draft.name,
  (name) => {
    if (!slugEdited.value) draft.slug = conditionGroupSlugFromName(name)
  },
)

const fieldLabels: Record<string, string> = {
  name: 'Name',
  slug: 'Slug',
  definition: 'Definition',
  sources: 'Sources',
  status: 'Status',
  members: 'Members',
}
const problems = ref<string[]>([])

function submit() {
  const result = conditionGroupBodySchema.safeParse({
    name: draft.name,
    slug: draft.slug,
    definition: draft.definition,
    sources: draft.sources,
    status: draft.status,
    members: draft.members.map(({ codeSystem, text }) => ({ codeSystem, text })),
  })
  if (!result.success) {
    const fields = new Set(result.error.issues.map((issue) => String(issue.path[0])))
    problems.value = [
      `Fix these fields: ${Object.keys(fieldLabels)
        .filter((f) => fields.has(f))
        .map((f) => fieldLabels[f] ?? f)
        .join(', ')}.`,
    ]
    return
  }
  const unread = result.data.members.flatMap((m, i) => {
    const parsed = parseConditionMember(m)
    return parsed.ok ? [] : [`Member ${String(i + 1)}: ${parsed.error}`]
  })
  problems.value = unread
  if (unread.length === 0) emit('save', result.data)
}

const inputClass =
  'mt-1 block w-full rounded border border-input-border bg-background px-3 py-1.5 text-foreground'
const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
</script>

<template>
  <form
    class="space-y-4 rounded border border-border p-4"
    :aria-label="title"
    novalidate
    @submit.prevent="submit"
  >
    <h3 class="font-display text-xl font-medium text-heading">{{ title }}</h3>

    <div v-if="problems.length > 0 || serverError" role="alert" class="space-y-1 text-danger">
      <p v-for="p in problems" :key="p">{{ p }}</p>
      <p v-if="serverError">Could not save: {{ serverError }}</p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label :for="`${id}-name`" class="font-medium">Name</label>
        <input :id="`${id}-name`" v-model="draft.name" type="text" :class="inputClass" />
      </div>
      <div>
        <label :for="`${id}-slug`" class="font-medium">Slug</label>
        <input
          :id="`${id}-slug`"
          v-model="draft.slug"
          type="text"
          :class="inputClass"
          :aria-describedby="`${id}-slug-help`"
          @input="slugEdited = true"
        />
        <p :id="`${id}-slug-help`" class="mt-1 text-sm text-muted-foreground">
          Lowercase letters, digits and hyphens. Must be unique.
        </p>
      </div>
    </div>

    <div>
      <label :for="`${id}-definition`" class="font-medium">Definition</label>
      <textarea :id="`${id}-definition`" v-model="draft.definition" rows="2" :class="inputClass" />
    </div>
    <div>
      <label :for="`${id}-sources`" class="font-medium">Sources</label>
      <textarea
        :id="`${id}-sources`"
        v-model="draft.sources"
        rows="3"
        :class="inputClass"
        :aria-describedby="`${id}-sources-help`"
      />
      <p :id="`${id}-sources-help`" class="mt-1 text-sm text-muted-foreground">
        Where the codes come from: code set headings, ICD-10-CM blocks, a state’s category. For CPT,
        code numbers only, never the AMA’s descriptions.
      </p>
    </div>

    <div>
      <label :for="`${id}-status`" class="font-medium">Status</label>
      <select :id="`${id}-status`" v-model="draft.status" :class="inputClass">
        <option v-for="s in conditionGroupStatuses" :key="s" :value="s">
          {{ conditionGroupStatusLabels[s] }}
        </option>
      </select>
      <p class="mt-1 text-sm text-muted-foreground">
        Only published groups give like codes on public code pages.
      </p>
    </div>

    <fieldset class="space-y-2">
      <legend class="font-medium">Members</legend>
      <p class="text-sm text-muted-foreground">
        One code, a list, a wildcard (<span class="font-mono">F20.*</span>) or a range (<span
          class="font-mono"
          >C00-C96</span
        >). Each member covers its codes and every code under them.
      </p>
      <div v-for="(m, i) in draft.members" :key="m.key" class="flex flex-wrap items-end gap-2">
        <div>
          <label :for="`${id}-system-${String(m.key)}`" class="sr-only"
            >Code system, member {{ i + 1 }}</label
          >
          <select :id="`${id}-system-${String(m.key)}`" v-model="m.codeSystem" :class="inputClass">
            <option v-for="s in memberSystems" :key="s" :value="s">
              {{ codeSystemLabels[s] }}
            </option>
          </select>
        </div>
        <div class="min-w-48 flex-1">
          <label :for="`${id}-text-${String(m.key)}`" class="sr-only"
            >Codes, member {{ i + 1 }}</label
          >
          <input
            :id="`${id}-text-${String(m.key)}`"
            v-model="m.text"
            type="text"
            :class="[inputClass, 'font-mono']"
          />
        </div>
        <button
          type="button"
          :class="smallButton"
          :aria-label="`Remove member ${String(i + 1)}`"
          @click="draft.members.splice(i, 1)"
        >
          Remove
        </button>
      </div>
      <button
        type="button"
        :class="smallButton"
        @click="draft.members.push(memberRow('icd10cm', ''))"
      >
        Add member
      </button>
    </fieldset>

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
