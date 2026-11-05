<script setup lang="ts">
import { computed } from 'vue'

import { isExternalHref, type MarkdownInline, parseMarkdown } from '@mfcd/shared'

// Renders Markdown as text nodes (packages/shared/src/markdown.ts); never as HTML. Headings move
// down `shift` levels so a doc's "#" fits under the page's own heading.
const props = withDefaults(defineProps<{ source: string; shift?: number }>(), { shift: 1 })
const blocks = computed(() => parseMarkdown(props.source))
const tag = (level: number) => `h${String(Math.min(level + props.shift, 6))}`
const headingClass = (level: number) =>
  level === 1
    ? 'font-display text-2xl font-medium text-heading'
    : level === 2
      ? 'font-display text-xl font-medium text-heading pt-2'
      : 'font-medium'
const segments = (text: MarkdownInline[]) => text
</script>

<template>
  <div class="max-w-prose space-y-3">
    <template v-for="(block, i) in blocks" :key="i">
      <component
        :is="tag(block.level)"
        v-if="block.type === 'heading'"
        :class="headingClass(block.level)"
      >
        <template v-for="(seg, j) in segments(block.text)" :key="j">
          <code v-if="seg.type === 'code'" class="font-mono text-sm">{{ seg.text }}</code>
          <template v-else>{{ seg.text }}</template>
        </template>
      </component>
      <!-- tabindex: a wide block scrolls sideways, so keyboard users must be able to reach it. -->
      <pre
        v-else-if="block.type === 'code'"
        tabindex="0"
        class="overflow-x-auto rounded border border-border bg-surface p-3 text-sm"
      ><code class="font-mono">{{ block.text }}</code></pre>
      <component
        :is="block.ordered ? 'ol' : 'ul'"
        v-else-if="block.type === 'list'"
        :class="block.ordered ? 'list-decimal' : 'list-disc'"
        class="space-y-1 pl-6"
      >
        <li v-for="(item, j) in block.items" :key="j">
          <template v-for="(seg, k) in item" :key="k">
            <code v-if="seg.type === 'code'" class="font-mono text-sm">{{ seg.text }}</code>
            <strong v-else-if="seg.type === 'bold'">{{ seg.text }}</strong>
            <a
              v-else-if="seg.type === 'link'"
              :href="seg.href"
              :rel="isExternalHref(seg.href) ? 'noopener noreferrer external' : undefined"
              class="text-link underline"
              >{{ seg.text }}</a
            >
            <template v-else>{{ seg.text }}</template>
          </template>
        </li>
      </component>
      <p v-else>
        <template v-for="(seg, j) in block.text" :key="j">
          <code v-if="seg.type === 'code'" class="font-mono text-sm">{{ seg.text }}</code>
          <strong v-else-if="seg.type === 'bold'">{{ seg.text }}</strong>
          <a
            v-else-if="seg.type === 'link'"
            :href="seg.href"
            :rel="isExternalHref(seg.href) ? 'noopener noreferrer external' : undefined"
            class="text-link underline"
            >{{ seg.text }}</a
          >
          <template v-else>{{ seg.text }}</template>
        </template>
      </p>
    </template>
  </div>
</template>
