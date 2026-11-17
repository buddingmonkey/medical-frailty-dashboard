<script setup lang="ts">
import { pageDescriptions, pageTitles, whoamiResponseSchema } from '@mfcd/shared'
import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import WatchBanner from '../components/admin/WatchBanner.vue'
import { ApiError, getJson } from '../lib/api'
import { usePageMeta } from '../lib/page-meta'

// One title for every admin page: they are `noindex` and behind Access (M8 step 4).
usePageMeta({ title: pageTitles.admin, description: pageDescriptions.admin })

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

// Grouped in the order of the Overview's steps: add a list, then map its categories.
const groups = [
  {
    id: 'add',
    label: 'Add a list',
    links: [
      { to: '/admin/sources', label: 'Source files' },
      { to: '/admin/ingest', label: 'Read and map' },
      { to: '/admin/drafts', label: 'Drafts' },
      { to: '/admin/versions', label: 'Versions' },
    ],
  },
  {
    id: 'categories',
    label: 'Categories',
    links: [
      { to: '/admin/mappings', label: 'Mappings' },
      { to: '/admin/categories', label: 'Federal categories' },
      { to: '/admin/unified', label: 'Unified categories' },
      { to: '/admin/condition-groups', label: 'Condition groups' },
    ],
  },
  {
    id: 'site',
    label: 'Site',
    links: [
      { to: '/admin/launch-readiness', label: 'Launch readiness' },
      { to: '/admin/watch', label: 'Watch dates' },
      { to: '/admin/restore', label: 'Backup and restore' },
      { to: '/admin/audit', label: 'Audit log' },
      { to: '/admin/guide', label: 'Guide' },
    ],
  },
] as const

const linkClass = 'block rounded px-3 py-1.5 text-foreground no-underline hover:bg-surface'
const activeClass = 'bg-surface font-medium text-heading'
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
      <nav aria-label="Admin" class="space-y-4 md:w-48 md:shrink-0">
        <RouterLink to="/admin" :exact-active-class="activeClass" :class="linkClass">
          Overview
        </RouterLink>
        <div v-for="group in groups" :key="group.id">
          <p
            :id="`admin-nav-${group.id}`"
            class="px-3 pb-1 text-sm font-medium text-muted-foreground"
          >
            {{ group.label }}
          </p>
          <ul
            :aria-labelledby="`admin-nav-${group.id}`"
            class="flex flex-wrap gap-2 md:flex-col md:gap-1"
          >
            <li v-for="link in group.links" :key="link.to">
              <RouterLink :to="link.to" :exact-active-class="activeClass" :class="linkClass">
                {{ link.label }}
              </RouterLink>
            </li>
          </ul>
        </div>
      </nav>
      <div class="min-w-0 flex-1">
        <RouterView />
      </div>
    </div>
  </div>
</template>
