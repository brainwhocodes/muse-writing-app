<script setup lang="ts">
import { computed } from 'vue'
import { type StoryChapter, useProjectStore } from '../stores/project'
import { User, GripVertical, ChevronUp, ChevronDown, Edit3, Sparkles } from 'lucide-vue-next'

const props = defineProps<{
  chapter: StoryChapter
  index: number
  totalChapters: number
}>()

const emit = defineEmits<{
  (e: 'edit', chapter: StoryChapter): void
}>()

const projectStore = useProjectStore()

const statusColor = computed(() => {
  switch (props.chapter.status) {
    case 'idea': return 'border-l-warning'
    case 'draft': return 'border-l-info'
    case 'complete': return 'border-l-success'
    default: return 'border-l-base-300'
  }
})

function getCharacterName(id: string) {
  const char = projectStore.characterOutline.find(c => c.id === id)
  return char ? char.name.substring(0, 2).toUpperCase() : '?'
}

function getSummaryHtml() {
  if (props.chapter.summary && props.chapter.summary.trim().length > 0) {
    return props.chapter.summary
  }
  return '<p class="opacity-60">No summary provided.</p>'
}

function moveUp() {
  projectStore.moveChapter(props.chapter.id, 'up')
}

function moveDown() {
  projectStore.moveChapter(props.chapter.id, 'down')
}
</script>

<template>
  <div 
    class="card bg-base-100 shadow-sm hover:shadow-md transition-all duration-200 border border-base-200 border-l-4 group"
    :class="statusColor"
  >
    <div class="card-body p-4 flex-row gap-4 items-start">
      
      <!-- Drag/Move Controls -->
      <div class="flex flex-col gap-1 items-center text-base-content/30 pt-1">
        <button 
          @click.stop="moveUp" 
          class="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0" 
          :disabled="index === 0"
        >
          <ChevronUp class="w-4 h-4" />
        </button>
        <span class="font-mono text-xs font-bold opacity-50">{{ index + 1 }}</span>
        <button 
          @click.stop="moveDown" 
          class="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0"
          :disabled="index === totalChapters - 1"
        >
          <ChevronDown class="w-4 h-4" />
        </button>
      </div>

      <!-- Main Content -->
      <div class="flex-1 min-w-0 cursor-pointer" @click="$emit('edit', chapter)">
        <div class="flex justify-between items-start mb-1">
          <h3 class="font-bold text-lg truncate pr-4 group-hover:text-primary transition-colors">
            {{ chapter.title || 'Untitled Chapter' }}
          </h3>
          
          <!-- Status Badge -->
          <div class="badge badge-sm badge-outline opacity-70 uppercase text-[10px] font-bold tracking-wider">
            {{ chapter.status }}
          </div>
        </div>

        <div class="text-base-content/70 text-sm line-clamp-2 mb-3 leading-relaxed prose prose-sm max-w-none"
             v-html="getSummaryHtml()">
        </div>

        <!-- Footer: Characters & Actions -->
        <div class="flex items-center justify-between mt-2">
          
          <!-- Character Avatars -->
          <div class="flex -space-x-2 overflow-hidden">
            <div 
              v-for="charId in chapter.characters?.slice(0, 5)" 
              :key="charId"
              class="avatar placeholder"
            >
              <div class="bg-neutral text-neutral-content w-6 h-6 rounded-full ring ring-base-100 ring-offset-1 text-[10px] font-bold flex items-center justify-center" :title="getCharacterName(charId)">
                <span>{{ getCharacterName(charId) }}</span>
              </div>
            </div>
            <div v-if="(chapter.characters?.length || 0) > 5" class="avatar placeholder">
              <div class="bg-base-300 text-base-content w-6 h-6 rounded-full ring ring-base-100 ring-offset-1 text-[10px] flex items-center justify-center">
                <span>+{{ (chapter.characters?.length || 0) - 5 }}</span>
              </div>
            </div>
          </div>

          <!-- Quick Action Hint -->
          <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
            <button class="btn btn-ghost btn-xs gap-1 text-base-content/60">
              <Edit3 class="w-3 h-3" /> Edit
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
