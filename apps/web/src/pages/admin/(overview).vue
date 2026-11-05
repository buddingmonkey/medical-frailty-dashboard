<template>
  <section class="max-w-prose space-y-4">
    <h2 class="font-display text-2xl font-medium text-heading">Overview</h2>
    <p class="text-foreground">
      Load each state’s list of medically frail codes, check it and publish it. Every change is
      recorded in the <RouterLink to="/admin/audit">Audit log</RouterLink>.
    </p>
    <p class="text-foreground">
      The real site holds the real lists. The preview site holds test data and shows a “Preview
      site” banner at the top of every page. Nothing you change there reaches the real site.
    </p>

    <h3 class="font-display text-xl font-medium text-heading">Add or update a state’s list</h3>
    <ol class="list-decimal space-y-1 pl-6 text-foreground">
      <li>
        <RouterLink to="/admin/sources">Source files</RouterLink>: upload the state’s original file.
      </li>
      <li>
        <RouterLink to="/admin/ingest">Read and map</RouterLink>: open the file, say what each
        column means, review the rows and send them to a draft.
      </li>
      <li>
        <RouterLink to="/admin/drafts">Drafts</RouterLink>: read the checks, then publish. An
        earlier list can be restored from <RouterLink to="/admin/versions">Versions</RouterLink>.
      </li>
      <li>
        <RouterLink to="/admin/mappings">Mappings</RouterLink>: map each of the state’s categories
        to unified categories and approve them.
      </li>
      <li>
        <RouterLink to="/admin/categories">Federal categories</RouterLink>: confirm or correct the
        guessed federal category for each state category.
      </li>
    </ol>
    <p class="text-foreground">
      The <RouterLink to="/admin/guide">Guide</RouterLink> explains each step.
    </p>

    <h3 class="font-display text-xl font-medium text-heading">Other pages</h3>
    <ul class="list-disc space-y-1 pl-6 text-foreground">
      <li>
        <RouterLink to="/admin/unified">Unified categories</RouterLink>: the shared categories used
        to compare states.
      </li>
      <li>
        <RouterLink to="/admin/condition-groups">Condition groups</RouterLink>: the code groups
        behind the “Like codes” section of a code’s page.
      </li>
      <li>
        <RouterLink to="/admin/launch-readiness">Launch readiness</RouterLink>: which states are
        ready for the public launch.
      </li>
      <li>
        <RouterLink to="/admin/watch">Watch dates</RouterLink>: deadlines and dates to check a
        state’s list again.
      </li>
      <li>
        <RouterLink to="/admin/restore">Backup and restore</RouterLink>: download a backup, restore
        a state’s list from one, and see the weekly maintenance.
      </li>
    </ul>
  </section>
</template>
