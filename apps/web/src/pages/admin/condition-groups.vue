<script setup lang="ts">
import {
  type ConditionGroup,
  type ConditionGroupBody,
  conditionGroupListResponseSchema,
  conditionGroupSaveResponseSchema,
  conditionGroupStatusLabels,
  codeSystemLabels,
} from '@mfcd/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { nextTick, ref, useTemplateRef } from 'vue'

import ConditionGroupForm from '../../components/admin/ConditionGroupForm.vue'
import { unifiedStatusClasses } from '../../lib/admin-unified'
import { getJson, sendJson } from '../../lib/api'

// Condition groups (roadmap M6 step 4; docs/data-model.md, "Like codes"): hand-curated lists of
// codes in several code systems for one condition, which give "like" codes on code pages.
const queryClient = useQueryClient()
const list = useQuery({
  queryKey: ['admin', 'condition-groups'],
  queryFn: async () =>
    (await getJson('/api/admin/condition-groups', conditionGroupListResponseSchema)).items,
})

/** null: no form open; 'new': the create form; else the group being edited. */
const editing = ref<ConditionGroup | 'new' | null>(null)
const formRegion = useTemplateRef<HTMLElement>('formRegion')
const saved = ref<string | null>(null)

async function openForm(target: ConditionGroup | 'new') {
  editing.value = target
  saved.value = null
  save.reset()
  await nextTick()
  formRegion.value?.querySelector('input')?.focus()
}

const save = useMutation({
  mutationFn: (body: ConditionGroupBody) => {
    const current = editing.value
    return current === 'new' || current === null
      ? sendJson('POST', '/api/admin/condition-groups', body, conditionGroupSaveResponseSchema)
      : sendJson(
          'PUT',
          `/api/admin/condition-groups/${String(current.id)}`,
          body,
          conditionGroupSaveResponseSchema,
        )
  },
  onSuccess: async (result, body) => {
    saved.value = `Saved ${body.name} (${String(result.members)} ${result.members === 1 ? 'member' : 'members'}).`
    editing.value = null
    await queryClient.invalidateQueries({ queryKey: ['admin', 'condition-groups'] })
  },
})

const systemsOf = (g: ConditionGroup) =>
  [...new Set(g.members.map((m) => m.codeSystem))].map((s) => codeSystemLabels[s]).join(', ')
const smallButton = 'rounded border border-border px-3 py-1 text-sm hover:bg-surface'
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Condition groups</h2>
      <p class="max-w-prose text-muted-foreground">
        Short lists of codes in several code systems that point at one condition, such as cancer
        diagnoses, chemotherapy services and chemotherapy drugs. On a code’s page, a state that does
        not list the code but lists another code system’s code in the same group is shown under
        “Like codes”. There is no official crosswalk, so these lists are ours. Only published groups
        appear on public pages.
      </p>
    </div>

    <p v-if="saved" role="status" class="font-medium">{{ saved }}</p>
    <p v-if="list.error.value" role="alert" class="text-danger">
      Could not load the condition groups: {{ list.error.value.message }}
    </p>

    <div v-if="editing === null">
      <button type="button" :class="smallButton" @click="openForm('new')">
        New condition group
      </button>
    </div>
    <div v-else ref="formRegion">
      <ConditionGroupForm
        :key="editing === 'new' ? 'new' : editing.id"
        :item="editing === 'new' ? undefined : editing"
        :saving="save.isPending.value"
        :server-error="save.error.value?.message ?? null"
        @save="save.mutate($event)"
        @cancel="editing = null"
      />
    </div>

    <p v-if="list.data.value && list.data.value.length === 0" class="text-muted-foreground">
      No condition groups yet.
    </p>
    <div v-else-if="list.data.value" class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <caption class="sr-only">
          Condition groups
        </caption>
        <thead class="border-b border-border text-muted-foreground">
          <tr>
            <th scope="col" class="py-2 pr-4 font-medium">Condition group</th>
            <th scope="col" class="py-2 pr-4 font-medium">Status</th>
            <th scope="col" class="py-2 pr-4 font-medium">Code systems</th>
            <th scope="col" class="py-2 pr-4 text-right font-medium">Members</th>
            <th scope="col" class="py-2 font-medium"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in list.data.value" :key="g.id" class="border-b border-border align-top">
            <th scope="row" class="py-2 pr-4 font-medium">
              {{ g.name }}
              <span class="block font-mono text-xs font-normal text-muted-foreground">{{
                g.slug
              }}</span>
              <span class="block max-w-prose text-xs font-normal text-muted-foreground">{{
                g.definition
              }}</span>
            </th>
            <td class="py-2 pr-4">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="unifiedStatusClasses[g.status]"
                >{{ conditionGroupStatusLabels[g.status] }}</span
              >
            </td>
            <td class="py-2 pr-4">{{ systemsOf(g) }}</td>
            <td class="py-2 pr-4 text-right">
              <span :title="g.members.map((m) => m.text).join(', ')">{{ g.members.length }}</span>
            </td>
            <td class="py-2">
              <button
                type="button"
                :class="smallButton"
                :aria-label="`Edit ${g.name}`"
                @click="openForm(g)"
              >
                Edit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
