<script setup lang="ts">
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
        Download every state’s lists, versions, sources (metadata only), mappings, watch dates and
        the audit log as one zip. Reference codes and computed tables are left out: they are
        reloaded or rebuilt.
      </p>
    </div>
    <div class="max-w-3xl space-y-2 rounded border border-border p-4">
      <h3 class="font-display text-xl font-medium text-heading">Download a backup</h3>
      <p class="text-foreground">
        The file holds admin email addresses (in the audit log). Keep it private.
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
