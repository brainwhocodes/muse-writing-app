<script setup lang="ts">
import { ArrowLeftRight, X, Loader2, Check } from 'lucide-vue-next'
import DiffViewer from './DiffViewer.vue'

interface TransitionResult {
  prevChapterId: string
  prevChapterTitle: string
  currChapterId: string
  currChapterTitle: string
  prevEnding: string
  currOpening: string
  suggestedPrevEnding: string
  suggestedCurrOpening: string
  techniqueUsed: string
  notes: string
}

defineProps<{
  isGenerating: boolean
  result: TransitionResult | null
}>()

const emit = defineEmits<{
  (e: 'apply', target: 'prev' | 'curr' | 'both'): void
  (e: 'close'): void
}>()
</script>

<template>
  <div class="modal modal-open backdrop-blur-sm">
    <div class="modal-box w-11/12 max-w-5xl shadow-2xl border border-base-200 max-h-[90vh] flex flex-col">
      <!-- Header -->
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-xl flex items-center gap-2">
          <ArrowLeftRight class="w-5 h-5 text-primary" />
          Chapter Transition
        </h3>
        <button @click="emit('close')" class="btn btn-ghost btn-sm btn-circle">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="isGenerating" class="flex flex-col items-center justify-center py-16">
        <Loader2 class="w-8 h-8 animate-spin text-primary mb-4" />
        <p class="text-base-content/60">Generating smooth transition...</p>
      </div>

      <!-- Results -->
      <div v-else-if="result" class="flex-1 overflow-y-auto space-y-6">
        <!-- Technique Used -->
        <div class="alert alert-info bg-info/10 border-info/30">
          <div>
            <div class="font-bold text-sm">Technique Used</div>
            <div class="text-sm">{{ result.techniqueUsed }}</div>
            <div v-if="result.notes" class="text-xs text-base-content/60 mt-1">{{ result.notes }}</div>
          </div>
        </div>

        <!-- Previous Chapter Ending -->
        <div class="space-y-2">
          <h4 class="font-bold flex items-center gap-2">
            <span class="badge badge-outline">Previous</span>
            {{ result.prevChapterTitle }} — Ending
          </h4>
          <div class="bg-base-100 p-4 rounded-xl border border-base-200 max-h-[30vh] overflow-y-auto">
            <DiffViewer 
              :original="result.prevEnding" 
              :suggested="result.suggestedPrevEnding" 
            />
          </div>
          <button @click="emit('apply', 'prev')" class="btn btn-sm btn-outline btn-success">
            <Check class="w-3 h-3 mr-1" />
            Apply to Previous Chapter
          </button>
        </div>

        <!-- Current Chapter Opening -->
        <div class="space-y-2">
          <h4 class="font-bold flex items-center gap-2">
            <span class="badge badge-primary">Current</span>
            {{ result.currChapterTitle }} — Opening
          </h4>
          <div class="bg-base-100 p-4 rounded-xl border border-base-200 max-h-[30vh] overflow-y-auto">
            <DiffViewer 
              :original="result.currOpening" 
              :suggested="result.suggestedCurrOpening" 
            />
          </div>
          <button @click="emit('apply', 'curr')" class="btn btn-sm btn-outline btn-success">
            <Check class="w-3 h-3 mr-1" />
            Apply to Current Chapter
          </button>
        </div>
      </div>

      <!-- Modal Actions -->
      <div v-if="result" class="modal-action border-t border-base-200 pt-4 mt-4">
        <button @click="emit('close')" class="btn btn-ghost">Cancel</button>
        <button @click="emit('apply', 'both')" class="btn btn-primary">
          <Check class="w-4 h-4 mr-2" />
          Apply Both Changes
        </button>
      </div>
    </div>
  </div>
</template>
