<script setup lang="ts">
import {
  type Confirmations,
  type DraftChecksResponse,
  publishResponseSchema,
  verifyConfirmations,
} from '@mfcd/shared'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { computed, reactive, useId, watch } from 'vue'

import { sendJson } from '../../lib/api'

// Publish a draft (docs/data-model.md, "Replacing a state's list"): every check that asks for
// a confirmation gets a tick, the strongest ones the state code typed. The API checks the same
// thing again with the same shared function, and refuses rows that changed since `checks`.
const props = defineProps<{
  versionId: number
  versionNo: number
  stateId: string
  stateName: string
  checks: DraftChecksResponse
}>()
/** `warning`: the publish stands, but its coverage recompute failed (Rebuild coverage repairs it). */
const emit = defineEmits<{ published: [warning: string | null] }>()

const id = useId()
const queryClient = useQueryClient()

const toConfirm = computed(() =>
  props.checks.report.checks.filter(
    (c) => c.triggered && (c.level === 'confirm' || c.level === 'confirm_typed'),
  ),
)
const ticked = reactive<Record<string, boolean>>({})
const typed = reactive<Record<string, string>>({})
// New checks: start over.
watch(
  () => props.checks.token,
  () => {
    for (const key of Object.keys(ticked)) Reflect.deleteProperty(ticked, key)
    for (const key of Object.keys(typed)) Reflect.deleteProperty(typed, key)
  },
)

const confirmations = computed<Confirmations>(() => {
  const given: Confirmations = {}
  for (const check of toConfirm.value) {
    if (check.level === 'confirm' && ticked[check.id]) given[check.id] = {}
    const text = typed[check.id]
    if (check.level === 'confirm_typed' && text) given[check.id] = { typed: text }
  }
  return given
})
const ready = computed(
  () => verifyConfirmations(props.checks.report, props.stateId, confirmations.value).ok,
)

const publish = useMutation({
  mutationFn: () =>
    sendJson(
      'POST',
      `/api/admin/drafts/${String(props.versionId)}/publish`,
      { token: props.checks.token, confirmations: confirmations.value },
      publishResponseSchema,
    ),
  onSuccess: async (result) => {
    emit('published', result.warning ?? null)
    await queryClient.invalidateQueries({ queryKey: ['admin'] })
  },
})
</script>

<template>
  <section class="space-y-3 rounded border border-border p-4" :aria-labelledby="`${id}-t`">
    <h3 :id="`${id}-t`" class="font-display text-xl font-medium text-heading">Publish</h3>
    <p v-if="publish.isSuccess.value" role="status" class="font-medium">
      Published. Draft v{{ versionNo }} is now {{ stateName }}’s public list.
    </p>
    <template v-else>
      <p v-if="!checks.report.canPublish" class="text-danger">
        A check blocks publishing. Fix the rows and send them again.
      </p>
      <p v-else class="max-w-prose text-muted-foreground">
        Publishing replaces {{ stateName }}’s public list in one step. The current list is backed up
        first and can be restored from “Versions”.
      </p>

      <fieldset v-if="toConfirm.length > 0" class="space-y-3">
        <legend class="font-medium">Confirm what the checks found</legend>
        <div v-for="check in toConfirm" :key="check.id">
          <label v-if="check.level === 'confirm'" class="flex items-start gap-2">
            <input v-model="ticked[check.id]" type="checkbox" class="mt-1" />
            <span>I have looked at this: {{ check.message }}</span>
          </label>
          <template v-else>
            <label :for="`${id}-${check.id}`" class="block">
              Type {{ stateId }} to confirm: {{ check.message }}
            </label>
            <input
              :id="`${id}-${check.id}`"
              v-model="typed[check.id]"
              type="text"
              autocomplete="off"
              class="mt-1 w-24 rounded border border-input-border bg-background px-2 py-1 uppercase"
            />
          </template>
        </div>
      </fieldset>

      <button
        type="button"
        class="rounded bg-primary px-4 py-2 text-on-primary hover:bg-primary-hover disabled:opacity-60"
        :disabled="!ready || publish.isPending.value"
        @click="publish.mutate()"
      >
        Publish draft v{{ versionNo }}
      </button>
      <p v-if="publish.error.value" role="alert" class="text-danger">
        Could not publish: {{ publish.error.value.message }}
      </p>
    </template>
  </section>
</template>
