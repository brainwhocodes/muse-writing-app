<script setup lang="ts">
import { computed } from 'vue'
import { GitCompare, Loader2, ChevronLeft, ChevronRight, AlertTriangle, ListChecks, Check, X, FileText, Sparkles } from 'lucide-vue-next'
import DiffViewer from './DiffViewer.vue'

interface ContinuityReflection {
  issues: string[]
  lineReferences: string[]
  fixes: string[]
  priorityFix: string
  storyImprovements: string[]
}

interface ContinuityResult {
  chapterId: string
  chapterTitle: string
  original: string
  suggested: string
  status: 'pending' | 'processing' | 'done' | 'error' | 'skipped'
  beats?: string[]
  reflection?: ContinuityReflection
  iterationCount?: number
}

const props = defineProps<{
  results: ContinuityResult[]
  currentIndex: number
  isChecking: boolean
  useGepa: boolean
  gepaStage: 'analyze' | 'reflect' | 'improve' | null
  iterations: number
}>()

const emit = defineEmits<{
  (e: 'update:currentIndex', value: number): void
  (e: 'update:useGepa', value: boolean): void
  (e: 'update:iterations', value: number): void
  (e: 'start'): void
  (e: 'apply', index: number): void
  (e: 'applyAll'): void
  (e: 'close'): void
}>()

const currentResult = computed(() => props.results[props.currentIndex])

const doneCount = computed(() => props.results.filter(r => r.status === 'done').length)
const totalCount = computed(() => props.results.filter(r => r.status !== 'skipped').length)

function navigateContinuity(direction: 'prev' | 'next') {
  const doneResults = props.results
    .map((r, i) => ({ ...r, index: i }))
    .filter(r => r.status === 'done')
  if (doneResults.length === 0) return
  const currentDoneIdx = doneResults.findIndex(r => r.index === props.currentIndex)
  let newIdx: number
  if (direction === 'next') {
    newIdx = currentDoneIdx < doneResults.length - 1 ? doneResults[currentDoneIdx + 1].index : doneResults[0].index
  } else {
    newIdx = currentDoneIdx > 0 ? doneResults[currentDoneIdx - 1].index : doneResults[doneResults.length - 1].index
  }
  emit('update:currentIndex', newIdx)
}
</script>

<template>
  <div class="modal modal-open backdrop-blur-sm">
    <div class="modal-box w-11/12 max-w-5xl shadow-2xl border border-base-200 max-h-[90vh] flex flex-col">
      <!-- Header -->
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-xl flex items-center gap-2">
          <GitCompare class="w-5 h-5 text-secondary" />
          Continuity Review
        </h3>
        <div class="flex items-center gap-4">
          <!-- GEPA Toggle + Iterations -->
          <div v-if="!isChecking" class="flex items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                class="checkbox checkbox-sm checkbox-secondary" 
                :checked="useGepa"
                @change="emit('update:useGepa', ($event.target as HTMLInputElement).checked)"
              />
              <span class="text-xs font-medium">GEPA</span>
            </label>
            <!-- Iteration Selector -->
            <div v-if="useGepa" class="flex items-center gap-1">
              <span class="text-xs text-base-content/60">Passes:</span>
              <select 
                class="select select-xs select-bordered w-14"
                :value="iterations"
                @change="emit('update:iterations', Number(($event.target as HTMLSelectElement).value))"
              >
                <option :value="1">1</option>
                <option :value="2">2</option>
                <option :value="3">3</option>
              </select>
            </div>
          </div>
          <!-- Progress -->
          <div v-if="isChecking" class="flex items-center gap-2 text-primary">
            <Loader2 class="w-4 h-4 animate-spin" />
            <span class="text-sm">{{ currentResult?.chapterTitle }}</span>
            <div v-if="useGepa && gepaStage" class="flex gap-1">
              <span class="badge badge-xs" :class="gepaStage === 'reflect' ? 'badge-warning' : 'badge-ghost'">Reflect</span>
              <span class="badge badge-xs" :class="gepaStage === 'improve' ? 'badge-success' : 'badge-ghost'">Improve</span>
            </div>
            <span v-if="currentResult?.iterationCount" class="text-xs text-base-content/50">
              ({{ currentResult.iterationCount }}/{{ iterations }})
            </span>
          </div>
          <div class="text-sm text-base-content/60">
            {{ doneCount }} / {{ totalCount }} ready
          </div>
        </div>
      </div>

      <!-- Chapter Progress Pills -->
      <div class="flex flex-wrap gap-2 mb-4 pb-4 border-b border-base-200">
        <button
          v-for="(result, idx) in results"
          :key="result.chapterId"
          @click="emit('update:currentIndex', idx)"
          class="btn btn-xs"
          :class="{
            'btn-primary': currentIndex === idx,
            'btn-success': result.status === 'done' && currentIndex !== idx,
            'btn-ghost opacity-50': result.status === 'skipped',
            'btn-warning': result.status === 'processing',
            'btn-error': result.status === 'error',
            'btn-outline': result.status === 'pending'
          }"
          :disabled="result.status === 'skipped' || result.status === 'pending'"
        >
          {{ idx + 1 }}. {{ result.chapterTitle.substring(0, 20) }}{{ result.chapterTitle.length > 20 ? '...' : '' }}
        </button>
      </div>

      <!-- Current Chapter Content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Done State -->
        <div v-if="currentResult?.status === 'done'" class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="font-bold text-lg">{{ currentResult?.chapterTitle }}</h4>
            <div class="flex gap-2">
              <button @click="navigateContinuity('prev')" class="btn btn-ghost btn-sm btn-circle">
                <ChevronLeft class="w-4 h-4" />
              </button>
              <button @click="navigateContinuity('next')" class="btn btn-ghost btn-sm btn-circle">
                <ChevronRight class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- GEPA Reflection Feedback Panel -->
          <div v-if="currentResult?.reflection" class="collapse collapse-arrow bg-base-200/50 rounded-xl border border-base-200">
            <input type="checkbox" checked />
            <div class="collapse-title font-medium flex items-center gap-2">
              <AlertTriangle class="w-4 h-4 text-warning" />
              Analysis Summary
              <span v-if="currentResult?.reflection?.priorityFix" class="badge badge-warning badge-sm ml-auto">
                Priority: {{ currentResult.reflection.priorityFix.substring(0, 40) }}{{ currentResult.reflection.priorityFix.length > 40 ? '...' : '' }}
              </span>
            </div>
            <div class="collapse-content space-y-3">
              <!-- Issues Found -->
              <div v-if="currentResult?.reflection?.issues?.length" class="space-y-1">
                <h5 class="text-xs font-bold uppercase tracking-wide text-error/70">Issues Found</h5>
                <ul class="text-sm space-y-1">
                  <li v-for="(issue, idx) in currentResult.reflection.issues" :key="idx" class="flex items-start gap-2">
                    <span class="text-error mt-0.5">•</span>
                    <span>{{ issue }}</span>
                  </li>
                </ul>
              </div>
              <!-- Line References -->
              <div v-if="currentResult?.reflection?.lineReferences?.length" class="space-y-1">
                <h5 class="text-xs font-bold uppercase tracking-wide text-warning/70">Problem Passages</h5>
                <div class="text-sm space-y-1">
                  <div v-for="(ref, idx) in currentResult.reflection.lineReferences" :key="idx" class="p-2 bg-warning/10 rounded border-l-2 border-warning text-xs italic">
                    "{{ ref }}"
                  </div>
                </div>
              </div>
              <!-- Fixes Applied -->
              <div v-if="currentResult?.reflection?.fixes?.length" class="space-y-1">
                <h5 class="text-xs font-bold uppercase tracking-wide text-success/70">Continuity Fixes</h5>
                <ul class="text-sm space-y-1">
                  <li v-for="(fix, idx) in currentResult.reflection.fixes" :key="idx" class="flex items-start gap-2">
                    <span class="text-success mt-0.5">✓</span>
                    <span>{{ fix }}</span>
                  </li>
                </ul>
              </div>
              <!-- Story Improvements -->
              <div v-if="currentResult?.reflection?.storyImprovements?.length" class="space-y-1">
                <h5 class="text-xs font-bold uppercase tracking-wide text-primary/70 flex items-center gap-1">
                  <Sparkles class="w-3 h-3" />
                  Story Improvements
                </h5>
                <ul class="text-sm space-y-1">
                  <li v-for="(improvement, idx) in currentResult.reflection.storyImprovements" :key="idx" class="flex items-start gap-2">
                    <span class="text-primary mt-0.5">★</span>
                    <span>{{ improvement }}</span>
                  </li>
                </ul>
              </div>
              <!-- No issues found -->
              <div v-if="!currentResult?.reflection?.issues?.length && !currentResult?.reflection?.fixes?.length && !currentResult?.reflection?.storyImprovements?.length" class="text-sm text-base-content/60 italic">
                No major issues detected. Minor polish applied.
              </div>
            </div>
          </div>

          <!-- Diff View -->
          <div class="bg-base-100 p-4 rounded-xl border border-base-200 max-h-[40vh] overflow-y-auto">
            <DiffViewer 
              :original="currentResult?.original || ''" 
              :suggested="currentResult?.suggested || ''" 
            />
          </div>

          <!-- Beats indicator -->
          <div v-if="currentResult?.beats?.length" class="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
            <ListChecks class="w-4 h-4 text-primary" />
            <span class="text-sm">
              <strong>{{ currentResult.beats.length }}</strong> story beats extracted
            </span>
            <span class="text-xs text-base-content/50 ml-auto">Will be added when accepted</span>
          </div>

          <div class="flex justify-end gap-2">
            <button @click="emit('apply', currentIndex)" class="btn btn-success btn-sm">
              <Check class="w-4 h-4 mr-1" />
              Accept{{ currentResult?.beats?.length ? ' + Beats' : '' }}
            </button>
          </div>
        </div>

        <!-- Processing State - Show reflection if available -->
        <div v-else-if="currentResult?.status === 'processing'" class="space-y-4">
          <!-- Show reflection if we have it (after reflect phase, during improve phase) -->
          <template v-if="currentResult?.reflection">
            <div class="flex items-center justify-between">
              <h4 class="font-bold text-lg">{{ currentResult?.chapterTitle }}</h4>
            </div>

            <!-- GEPA Reflection Feedback Panel -->
            <div class="collapse collapse-arrow bg-base-200/50 rounded-xl border border-base-200">
              <input type="checkbox" checked />
              <div class="collapse-title font-medium flex items-center gap-2">
                <AlertTriangle class="w-4 h-4 text-warning" />
                Analysis Summary
                <span v-if="currentResult?.reflection?.priorityFix" class="badge badge-warning badge-sm ml-auto">
                  Priority: {{ currentResult.reflection.priorityFix.substring(0, 40) }}{{ currentResult.reflection.priorityFix.length > 40 ? '...' : '' }}
                </span>
              </div>
              <div class="collapse-content space-y-3">
                <div v-if="currentResult?.reflection?.issues?.length" class="space-y-1">
                  <h5 class="text-xs font-bold uppercase tracking-wide text-error/70">Issues Found</h5>
                  <ul class="text-sm space-y-1">
                    <li v-for="(issue, idx) in currentResult.reflection.issues" :key="idx" class="flex items-start gap-2">
                      <span class="text-error mt-0.5">•</span>
                      <span>{{ issue }}</span>
                    </li>
                  </ul>
                </div>
                <div v-if="currentResult?.reflection?.lineReferences?.length" class="space-y-1">
                  <h5 class="text-xs font-bold uppercase tracking-wide text-warning/70">Problem Passages</h5>
                  <div class="text-sm space-y-1">
                    <div v-for="(ref, idx) in currentResult.reflection.lineReferences" :key="idx" class="p-2 bg-warning/10 rounded border-l-2 border-warning text-xs italic">
                      "{{ ref }}"
                    </div>
                  </div>
                </div>
                <div v-if="currentResult?.reflection?.fixes?.length" class="space-y-1">
                  <h5 class="text-xs font-bold uppercase tracking-wide text-success/70">Continuity Fixes</h5>
                  <ul class="text-sm space-y-1">
                    <li v-for="(fix, idx) in currentResult.reflection.fixes" :key="idx" class="flex items-start gap-2">
                      <span class="text-success mt-0.5">→</span>
                      <span>{{ fix }}</span>
                    </li>
                  </ul>
                </div>
                <div v-if="currentResult?.reflection?.storyImprovements?.length" class="space-y-1">
                  <h5 class="text-xs font-bold uppercase tracking-wide text-primary/70 flex items-center gap-1">
                    <Sparkles class="w-3 h-3" />
                    Story Improvements
                  </h5>
                  <ul class="text-sm space-y-1">
                    <li v-for="(improvement, idx) in currentResult.reflection.storyImprovements" :key="idx" class="flex items-start gap-2">
                      <span class="text-primary mt-0.5">★</span>
                      <span>{{ improvement }}</span>
                    </li>
                  </ul>
                </div>
                <div v-if="!currentResult?.reflection?.issues?.length && !currentResult?.reflection?.fixes?.length && !currentResult?.reflection?.storyImprovements?.length" class="text-sm text-base-content/60 italic">
                  No major issues detected. Minor polish being applied.
                </div>
              </div>
            </div>

            <!-- Generating improvements indicator -->
            <div class="flex items-center justify-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
              <Loader2 class="w-5 h-5 animate-spin text-primary" />
              <span class="text-sm">
                Generating improved chapter{{ currentResult?.iterationCount && iterations > 1 ? ` (pass ${currentResult.iterationCount}/${iterations})` : '' }}...
              </span>
            </div>
          </template>

          <!-- No reflection yet - still in reflect phase -->
          <template v-else>
            <div class="flex flex-col items-center justify-center py-16 text-base-content/50">
              <Loader2 class="w-8 h-8 animate-spin mb-4" />
              <p>Analyzing {{ currentResult.chapterTitle }}...</p>
            </div>
          </template>
        </div>

        <!-- Error State -->
        <div v-else-if="currentResult?.status === 'error'" class="flex flex-col items-center justify-center py-16 text-error">
          <X class="w-8 h-8 mb-4" />
          <p>Failed to process this chapter. Try again later.</p>
        </div>

        <!-- Empty State / Pre-Start State -->
        <div v-else class="flex flex-col items-center justify-center py-8">
          <!-- Show config when not started -->
          <template v-if="!isChecking && doneCount === 0">
            <GitCompare class="w-12 h-12 mb-4 text-secondary opacity-50" />
            <h4 class="font-bold text-lg mb-2">Ready to Check Continuity</h4>
            <p class="text-sm text-base-content/60 mb-6 text-center max-w-md">
              This will analyze {{ totalCount }} chapter{{ totalCount !== 1 ? 's' : '' }} for continuity issues and story improvements.
            </p>
            
            <!-- Settings Panel -->
            <div class="bg-base-200/50 rounded-xl p-4 w-full max-w-sm space-y-4">
              <!-- GEPA Toggle -->
              <label class="flex items-center justify-between cursor-pointer">
                <div>
                  <span class="font-medium">GEPA Mode</span>
                  <p class="text-xs text-base-content/60">Multi-pass analysis & improvement</p>
                </div>
                <input 
                  type="checkbox" 
                  class="toggle toggle-secondary" 
                  :checked="useGepa"
                  @change="emit('update:useGepa', ($event.target as HTMLInputElement).checked)"
                />
              </label>
              
              <!-- Iterations -->
              <div v-if="useGepa" class="flex items-center justify-between">
                <div>
                  <span class="font-medium">Improvement Passes</span>
                  <p class="text-xs text-base-content/60">More passes = better intros</p>
                </div>
                <select 
                  class="select select-sm select-bordered w-20"
                  :value="iterations"
                  @change="emit('update:iterations', Number(($event.target as HTMLSelectElement).value))"
                >
                  <option :value="1">1</option>
                  <option :value="2">2</option>
                  <option :value="3">3</option>
                </select>
              </div>
            </div>
          </template>
          
          <!-- Fallback empty state -->
          <template v-else>
            <FileText class="w-8 h-8 mb-4 opacity-50" />
            <p>Select a completed chapter to review changes.</p>
          </template>
        </div>
      </div>

      <!-- Modal Actions -->
      <div class="modal-action border-t border-base-200 pt-4 mt-4">
        <button @click="emit('close')" class="btn btn-ghost">Close</button>
        
        <!-- Start button when not yet started -->
        <button 
          v-if="!isChecking && doneCount === 0"
          @click="emit('start')" 
          class="btn btn-secondary"
        >
          <GitCompare class="w-4 h-4 mr-2" />
          Start Analysis
        </button>
        
        <!-- Accept All when done -->
        <button 
          v-else
          @click="emit('applyAll')" 
          class="btn btn-primary"
          :disabled="isChecking || doneCount === 0"
        >
          <Check class="w-4 h-4 mr-2" />
          Accept All Changes
        </button>
      </div>
    </div>
  </div>
</template>
