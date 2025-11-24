<script setup lang="ts">
import { computed } from 'vue'
import * as Diff from 'diff'
import { marked } from 'marked'

const props = defineProps<{
  original: string
  suggested: string
}>()

const diffs = computed(() => Diff.diffWordsWithSpace(props.original, props.suggested))

function renderMarkdown(fragment: string) {
  // Render small fragments inline; marked handles bold/italic/etc. from prompts
  return marked.parseInline(fragment)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-3 text-xs text-base-content/60">
      <span class="inline-flex items-center gap-2 rounded-full bg-success/15 px-2.5 py-1">
        <span class="w-2 h-2 rounded-full bg-success"></span>
        Added
      </span>
      <span class="inline-flex items-center gap-2 rounded-full bg-error/15 px-2.5 py-1">
        <span class="w-2 h-2 rounded-full bg-error"></span>
        Removed
      </span>
      <span class="inline-flex items-center gap-2 rounded-full bg-base-200 px-2.5 py-1">
        <span class="w-2 h-2 rounded-full bg-base-content/40"></span>
        Unchanged
      </span>
    </div>

    <div class="bg-base-100 p-5 rounded-xl border border-base-300 font-serif leading-relaxed text-lg whitespace-pre-wrap prose prose-sm max-w-none">
      <span
        v-for="(part, index) in diffs"
        :key="index"
        v-html="renderMarkdown(part.value)"
        :class="{
          'bg-success/25 text-success-content font-semibold rounded-md px-0.5': part.added,
          'bg-error/20 text-error-content line-through rounded-md px-0.5': part.removed,
          'text-base-content': !part.added && !part.removed
        }"
      />
    </div>
  </div>
</template>
