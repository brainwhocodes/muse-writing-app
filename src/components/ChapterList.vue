<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore, type StoryChapter } from '../stores/project'
import { Plus, Wand2 } from 'lucide-vue-next'
import { generateText } from '../services/ai'
import { AI_PROMPTS } from '../constants/prompts'
import ChapterItem from './ChapterItem.vue'
import ChapterEditor from './ChapterEditor.vue'

const projectStore = useProjectStore()

// ---------------------------------------------------------
// State
// ---------------------------------------------------------
const isGenerating = ref(false)
const prompt = ref('')
const showGenerateModal = ref(false)

// Edit / New State
// editingId is null when nothing is being edited
// when adding new, editingId is 'NEW'
const editingId = ref<string | null>(null)
const editForm = ref<Partial<StoryChapter>>({})

// ---------------------------------------------------------
// Actions
// ---------------------------------------------------------

function startEdit(chapter: StoryChapter) {
  // If we are already editing something, cancel it first? Or just switch?
  // Let's switch.
  editingId.value = chapter.id
  editForm.value = { ...chapter, characters: [...(chapter.characters || [])] }
}

function startAdd() {
  editingId.value = 'NEW'
  editForm.value = { title: '', summary: '', status: 'draft', characters: [] }
}

function cancelEdit() {
  editingId.value = null
  editForm.value = {}
}

function saveEdit() {
  if (!editForm.value) return

  if (editingId.value === 'NEW') {
    projectStore.addChapter({ 
       title: editForm.value.title || 'Untitled', 
       summary: editForm.value.summary || '', 
       status: editForm.value.status || 'draft',
       characters: editForm.value.characters || []
    })
  } else if (editingId.value) {
    projectStore.updateChapter(editingId.value, editForm.value)
  }
  
  cancelEdit()
}

// ---------------------------------------------------------
// AI Generation
// ---------------------------------------------------------
async function generateOutline() {
  if (!prompt.value.trim()) return
  
  isGenerating.value = true
  try {
    const systemPrompt = AI_PROMPTS.OUTLINE_GENERATOR
    const result = await generateText(prompt.value, '', 'outline', systemPrompt)
    
    const jsonMatch = result.match(/\[.*\]/s)
    if (jsonMatch) {
      const chapters = JSON.parse(jsonMatch[0])
      chapters.forEach((c: any) => {
        projectStore.addChapter({
          title: c.title,
          summary: c.summary,
          status: 'idea',
          characters: []
        })
      })
    } else {
      // Fallback
      projectStore.addChapter({
        title: 'AI Generated Chapter',
        summary: result,
        status: 'idea',
        characters: []
      })
    }
    showGenerateModal.value = false
    prompt.value = ''
  } catch (e) {
    console.error(e)
    alert('Failed to generate outline')
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col relative">
    
    <!-- Top Toolbar -->
    <div class="flex justify-between items-end mb-6 px-1">
      <div class="text-sm text-base-content/50 font-bold uppercase tracking-wide">
        Timeline
      </div>
      <div class="flex gap-2">
        <button @click="showGenerateModal = true" class="btn btn-ghost btn-sm text-primary">
          <Wand2 class="w-4 h-4 mr-2" />
          Generate
        </button>
        <button @click="startAdd" class="btn btn-primary btn-sm shadow-sm">
          <Plus class="w-4 h-4 mr-2" />
          Add Chapter
        </button>
      </div>
    </div>

    <!-- Timeline / List -->
    <div class="space-y-4 pb-20 relative">
       <!-- Vertical Line (Timeline spine) -->
       <div v-if="projectStore.storyOutline.length > 0" class="absolute left-8 top-4 bottom-4 w-0.5 bg-base-200 -z-10 hidden md:block"></div>

       <!-- New Chapter Editor (Top Position) -->
       <div v-if="editingId === 'NEW'" class="animate-in fade-in slide-in-from-top-2 duration-300 mb-8">
         <ChapterEditor 
           v-model="editForm" 
           :is-new="true"
           @save="saveEdit" 
           @cancel="cancelEdit"
         />
       </div>

       <!-- Chapter List -->
       <div 
         v-for="(chapter, index) in projectStore.storyOutline" 
         :key="chapter.id"
       >
         <!-- Editing this specific chapter -->
         <div v-if="editingId === chapter.id" class="animate-in fade-in zoom-in-95 duration-200">
            <ChapterEditor 
              v-model="editForm" 
              @save="saveEdit" 
              @cancel="cancelEdit"
            />
         </div>

         <!-- Viewing this chapter -->
         <ChapterItem 
           v-else
           :chapter="chapter" 
           :index="index" 
           :total-chapters="projectStore.storyOutline.length"
           @edit="startEdit"
         />
       </div>

       <!-- Empty State -->
       <div v-if="projectStore.storyOutline.length === 0 && editingId !== 'NEW'" class="text-center py-20 opacity-50 border-2 border-dashed border-base-200 rounded-xl">
         <p class="mb-4">Your story timeline is empty.</p>
         <button @click="startAdd" class="btn btn-sm btn-ghost">Start writing</button>
       </div>
    </div>

    <!-- Generate Modal -->
    <div v-if="showGenerateModal" class="modal modal-open backdrop-blur-sm z-50">
      <div class="modal-box shadow-2xl border border-base-200">
        <h3 class="font-bold text-lg mb-2 flex items-center gap-2">
          <Wand2 class="w-5 h-5 text-primary" />
          Generate Outline
        </h3>
        <p class="text-sm text-base-content/70 mb-6">Describe your story idea, and AI will generate a chapter-by-chapter outline for you.</p>
        
        <div class="form-control w-full mb-6">
          <textarea 
            v-model="prompt" 
            class="textarea textarea-bordered h-48 text-base leading-relaxed focus:outline-none" 
            placeholder="e.g. A cyberpunk detective story set in Neo-Tokyo where a rogue AI tries to prove it has a soul..."
            autofocus
          ></textarea>
        </div>
        
        <div class="modal-action">
          <button @click="showGenerateModal = false" class="btn btn-ghost" :disabled="isGenerating">Cancel</button>
          <button @click="generateOutline" class="btn btn-primary px-6" :disabled="isGenerating">
            <span v-if="isGenerating" class="loading loading-spinner loading-xs mr-2"></span>
            {{ isGenerating ? 'Generating...' : 'Generate' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
