<script setup lang="ts">
import { computed } from 'vue'
import * as Diff from 'diff'

const props = defineProps<{
  original: string
  suggested: string
}>()

const diffs = computed(() => {
  return Diff.diffWords(props.original, props.suggested)
})
</script>

<template>
  <div class="bg-base-100 p-4 rounded-lg border border-base-300 font-serif leading-relaxed text-lg whitespace-pre-wrap">
    <span 
      v-for="(part, index) in diffs" 
      :key="index"
      :class="{
        'bg-success/30 text-success-content': part.added,
        'bg-error/30 text-error-content line-through': part.removed,
        'text-base-content': !part.added && !part.removed
      }"
    >{{ part.value }}</span>
  </div>
</template>
