<script setup lang="ts">
import { whoamiResponseSchema } from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import WatchBanner from '../components/admin/WatchBanner.vue'
import { ApiError, getJson } from '../lib/api'

// The Worker has already checked the Access token before this page loads; this call only
// shows who is signed in (and catches a session that expired while the tab was open).
const whoami = useQuery({
  queryKey: ['admin', 'whoami'],
  queryFn: () => getJson('/api/admin/whoami', whoamiResponseSchema),
  staleTime: Infinity,
})

const signInProblem = computed(() => {
  const error = whoami.error.value
  if (!error) return null
  if (error instanceof ApiError && error.status === 403)
    return 'This account is not an admin of this site.'
  if (error instanceof ApiError && error.status === 401)
    return 'Your sign-in has expired. Reload the page to sign in again.'
  return 'Could not confirm your sign-in. Reload the page to try again.'
})

const sections = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/sources', label: 'Source files' },
  { to: '/admin/ingest', label: 'Read and map' },
  { to: '/admin/drafts', label: 'Drafts' },
  { to: '/admin/versions', label: 'Versions' },
  { to: '/admin/restore', label: 'Backup and restore' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/unified', label: 'Unified categories' },
  { to: '/admin/mappings', label: 'Mappings' },
  { to: '/admin/condition-groups', label: 'Condition groups' },
  { to: '/admin/guide', label: 'Guide' },
  { to: '/admin/watch', label: 'Watch dates' },
  { to: '/admin/audit', label: 'Audit log' },
] as const
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-4">
      <h1 class="font-display text-3xl font-medium text-heading">Admin</h1>
      <p class="text-sm text-muted-foreground">
        <template v-if="whoami.data.value">
          Signed in as
          <span class="font-medium text-foreground">{{ whoami.data.value.email }}</span>
          ·
        </template>
        <a href="/cdn-cgi/access/logout">Sign out</a>
      </p>
    </div>

    <p
      v-if="signInProblem"
      role="alert"
      class="rounded border border-border bg-surface px-4 py-3 text-foreground"
    >
      {{ signInProblem }}
    </p>

    <WatchBanner />

    <div class="flex flex-col gap-8 md:flex-row">
      <nav aria-label="Admin" class="md:w-48 md:shrink-0">
        <ul class="flex flex-wrap gap-2 md:flex-col md:gap-1">
          <li v-for="section in sections" :key="section.to">
            <RouterLink
              :to="section.to"
              exact-active-class="bg-surface font-medium text-heading"
              class="block rounded px-3 py-1.5 text-foreground no-underline hover:bg-surface"
            >
              {{ section.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
      <div class="min-w-0 flex-1">
        <RouterView />
      </div>
    </div>
  </div>
</template>
