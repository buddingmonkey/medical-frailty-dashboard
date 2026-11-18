<script setup lang="ts">
import { RouterLink } from 'vue-router'

import BackupImport from '../../components/admin/BackupImport.vue'
import MaintenancePanel from '../../components/admin/MaintenancePanel.vue'

// Backups (docs/deployment.md, "Backups and restore"): the full download, and restore path 2.
// The download is a plain link: the browser sends the Access cookie, and the Worker streams the
// zip with Content-Disposition: attachment.
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-2">
      <h2 class="font-display text-2xl font-medium text-heading">Backup and restore</h2>
      <p class="max-w-prose text-muted-foreground">
        A backup is one zip file of all site data except the source files and the reference code
        lists. The <RouterLink to="/admin/guide">Guide</RouterLink> lists what it contains.
      </p>
    </div>
    <div class="max-w-3xl space-y-2 rounded border border-border p-4">
      <h3 class="font-display text-xl font-medium text-heading">Download a backup</h3>
      <p
        class="rounded border-l-4 border-highlight bg-surface px-3 py-1 text-foreground"
        role="note"
      >
        Every backup, including the saved ones, holds admin email addresses. Keep backups private.
      </p>
      <a
        href="/api/admin/backup"
        download
        class="inline-block rounded bg-primary px-4 py-2 text-on-primary no-underline"
        >Download backup</a
      >
    </div>
    <BackupImport />
    <MaintenancePanel />
  </section>
</template>
