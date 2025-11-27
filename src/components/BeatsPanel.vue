<script setup lang="ts">
import { ref, computed } from 'vue'
import { ListChecks, Wand2, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-vue-next'

interface StoryBeat {
  id: string
  text: string
  resolved: boolean
}

const props = defineProps<{
  beats: StoryBeat[]
  isGenerating: boolean
  useGepa: boolean
  gepaStage: 'generate' | 'reflect' | 'improve' | null
}>()

const emit = defineEmits<{
  (e: 'update:useGepa', value: boolean): void
  (e: 'add', text: string): void
  (e: 'toggle', beatId: string): void
  (e: 'remove', beatId: string): void
  (e: 'generate'): void
}>()

const newBeatText = ref('')

const beatsProgress = computed(() => {
  if (props.beats.length === 0) return { resolved: 0, total: 0, percent: 0 }
  const resolved = props.beats.filter(b => b.resolved).length
  return { resolved, total: props.beats.length, percent: Math.round((resolved / props.beats.length) * 100) }
})

function addBeat() {
  if (!newBeatText.value.trim()) return
  emit('add', newBeatText.value.trim())
  newBeatText.value = ''
}
</script>

<template>
  <div>
    <!-- Header with Progress -->
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-xs font-bold uppercase tracking-wider opacity-50 flex items-center gap-2">
        <ListChecks class="w-3 h-3" />
        Story Beats
      </h3>
      <div v-if="beats.length > 0" class="flex items-center gap-2">
        <span class="text-[10px] text-base-content/50">{{ beatsProgress.resolved }}/{{ beatsProgress.total }}</span>
        <div class="w-12 h-1.5 bg-base-300 rounded-full overflow-hidden">
          <div 
            class="h-full bg-success transition-all duration-300" 
            :style="{ width: `${beatsProgress.percent}%` }"
          ></div>
        </div>
      </div>
    </div>

    <!-- GEPA Progress (when generating) -->
    <div v-if="isGenerating" class="flex items-center gap-2 mb-3 p-2 rounded-lg bg-primary/10 border border-primary/20">
      <span class="text-xs">Generating beats...</span>
      <div v-if="useGepa && gepaStage" class="flex gap-1 ml-auto">
        <span class="badge badge-xs" :class="gepaStage === 'generate' ? 'badge-info' : 'badge-ghost'">Draft</span>
        <span class="badge badge-xs" :class="gepaStage === 'reflect' ? 'badge-warning' : 'badge-ghost'">Reflect</span>
        <span class="badge badge-xs" :class="gepaStage === 'improve' ? 'badge-success' : 'badge-ghost'">Improve</span>
      </div>
    </div>

    <!-- Beat List -->
    <div class="space-y-2 mb-3">
      <div 
        v-for="beat in beats" 
        :key="beat.id"
        class="group flex items-start gap-2 p-2 rounded-lg transition-colors"
        :class="beat.resolved ? 'bg-success/10' : 'bg-base-200/50 hover:bg-base-200'"
      >
        <button 
          @click="emit('toggle', beat.id)" 
          class="mt-0.5 shrink-0"
          :class="beat.resolved ? 'text-success' : 'text-base-content/30 hover:text-primary'"
        >
          <CheckCircle2 v-if="beat.resolved" class="w-4 h-4" />
          <Circle v-else class="w-4 h-4" />
        </button>
        <span 
          class="flex-1 text-sm leading-snug"
          :class="beat.resolved ? 'line-through text-base-content/50' : ''"
        >{{ beat.text }}</span>
        <button 
          @click="emit('remove', beat.id)" 
          class="opacity-0 group-hover:opacity-100 text-base-content/30 hover:text-error transition-opacity"
        >
          <Trash2 class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- Add Beat Input -->
    <div class="flex gap-2">
      <input 
        v-model="newBeatText"
        @keyup.enter="addBeat"
        type="text" 
        class="input input-bordered input-sm flex-1 text-sm" 
        placeholder="Add a story beat..."
      />
      <button @click="addBeat" class="btn btn-sm btn-ghost btn-square" :disabled="!newBeatText.trim()">
        <Plus class="w-4 h-4" />
      </button>
    </div>

    <!-- Empty State with Generate Option -->
    <div v-if="beats.length === 0 && !isGenerating" class="mt-3 p-3 rounded-lg border border-dashed border-base-300 text-center">
      <p class="text-xs text-base-content/50 mb-2">No beats defined yet</p>
      <button @click="emit('generate')" class="btn btn-xs btn-primary gap-1" :disabled="isGenerating">
        <Wand2 class="w-3 h-3" />
        Generate from Synopsis
      </button>
      <label class="flex items-center justify-center gap-2 mt-2 cursor-pointer">
        <input 
          type="checkbox" 
          class="checkbox checkbox-xs checkbox-primary" 
          :checked="useGepa"
          @change="emit('update:useGepa', ($event.target as HTMLInputElement).checked)"
        />
        <span class="text-[10px] text-base-content/50">GEPA (better quality)</span>
      </label>
    </div>
  </div>
</template>
