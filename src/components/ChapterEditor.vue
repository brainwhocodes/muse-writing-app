<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore, type StoryChapter } from '../stores/project'
import { generateText } from '../services/ai'
import { AI_PROMPTS } from '../constants/prompts'
import { Wand2, User, AlignLeft, Hash, ChevronDown } from 'lucide-vue-next'
import RichTextEditor from './RichTextEditor.vue'
import { marked } from 'marked'

const props = defineProps<{
  modelValue: Partial<StoryChapter>
  isNew?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Partial<StoryChapter>): void
  (e: 'save'): void
  (e: 'cancel'): void
}>()

const projectStore = useProjectStore()
const isGeneratingBeats = ref(false)
const showBeatsPrompt = ref(false)
const beatsPrompt = ref('Highlight 4-6 escalating scene beats. Focus on cause-and-effect turns, emotional reversals, sensory details, and cliffhanger endings.')

function isHtml(content: string) {
  return /<[a-z][\s\S]*>/i.test(content)
}

const summaryHtml = computed(() => {
  const content = props.modelValue.summary || ''
  if (!content) return ''
  if (isHtml(content)) {
    return content
  }
  const parsed = marked.parse(content, { async: false }) as string
  return parsed
})

function updateField(field: keyof StoryChapter, value: any) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

function toggleCharacter(charId: string) {
  const currentChars = props.modelValue.characters ? [...props.modelValue.characters] : []
  const idx = currentChars.indexOf(charId)
  if (idx === -1) {
    currentChars.push(charId)
  } else {
    currentChars.splice(idx, 1)
  }
  updateField('characters', currentChars)
}

function stripHtml(html: string) {
  const tmp = document.createElement("DIV")
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ""
}

async function suggestBeats(customPrompt?: string) {
  if (!props.modelValue.summary) return
  isGeneratingBeats.value = true
  try {
    const plainSummary = stripHtml(props.modelValue.summary)
    const chapterTitle = props.modelValue.title || 'Untitled Chapter'
    const characterDetails = (props.modelValue.characters || [])
      .map(id => projectStore.characterOutline.find(char => char.id === id))
      .filter(Boolean)
      .map(char => `${char!.name}: ${stripHtml(char!.bio)}`)
      .join('\n')

    const contextParts = [
      `Chapter Title: ${chapterTitle}`,
      `Summary: ${plainSummary}`,
      characterDetails ? `Characters Present:\n${characterDetails}` : '',
      customPrompt ? `Author Instructions: ${customPrompt}` : ''
    ].filter(Boolean)

    const context = contextParts.join('\n\n')
    const systemPrompt = AI_PROMPTS.SCENE_BEAT_MAKER
    const result = await generateText(context, '', 'outline', systemPrompt)
    
    const currentHtml = props.modelValue.summary
    const beatsHtml = await marked.parse(result)
    const newSummary = currentHtml + '<p><strong>SUGGESTED BEATS:</strong></p>' + beatsHtml
    updateField('summary', newSummary)
  } catch (e) {
    console.error(e)
  } finally {
    isGeneratingBeats.value = false
  }
}
</script>

<template>
  <div class="card bg-base-100 shadow-xl border border-base-100 overflow-visible group relative">
    <!-- Gradient Accent on Top -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-primary/40 to-secondary/40 rounded-t-xl"></div>

    <div class="card-body p-6 md:p-8 space-y-6">
      
      <!-- Header Area: Status & Title -->
      <div class="flex flex-col gap-4">
        <div class="flex justify-between items-start">
           <div class="badge badge-ghost gap-2 pl-1 pr-3 text-xs font-bold uppercase tracking-wider">
              <Hash class="w-3 h-3 text-base-content/40" />
              {{ isNew ? 'New' : 'Editing' }}
           </div>
           
           <!-- Custom Status Dropdown (Visual) -->
           <div class="dropdown dropdown-end">
              <div tabindex="0" role="button" class="badge badge-lg gap-2 cursor-pointer font-bold border-none transition-colors" :class="{
                 'bg-warning/10 text-warning hover:bg-warning/20': modelValue.status === 'idea',
                 'bg-info/10 text-info hover:bg-info/20': modelValue.status === 'draft',
                 'bg-success/10 text-success hover:bg-success/20': modelValue.status === 'complete'
              }">
                {{ modelValue.status || 'Draft' }}
                <ChevronDown class="w-3 h-3 opacity-50" />
              </div>
              <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow-lg bg-base-100 rounded-box w-40 border border-base-200 mt-1">
                 <li @click="updateField('status', 'idea')"><a class="text-warning">Idea</a></li>
                 <li @click="updateField('status', 'draft')"><a class="text-info">In Draft</a></li>
                 <li @click="updateField('status', 'complete')"><a class="text-success">Complete</a></li>
              </ul>
           </div>
        </div>
        
        <!-- Title Input (Ghost Style) -->
        <input 
          :value="modelValue.title"
          @input="updateField('title', ($event.target as HTMLInputElement).value)"
          type="text" 
          class="input input-ghost px-0 text-3xl md:text-4xl font-serif font-bold placeholder:text-base-content/20 focus:bg-transparent h-auto"
          placeholder="Chapter Title"
          autofocus
        />
      </div>

      <div class="divider my-0"></div>

      <!-- Summary Section -->
      <div class="space-y-3">
        <div class="flex justify-between items-center">
           <label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-base-content/40">
             <AlignLeft class="w-4 h-4" /> Summary
           </label>
           <button 
              @click="showBeatsPrompt = true"
              class="btn btn-xs btn-ghost text-primary hover:bg-primary/10 gap-1.5 transition-all"
              :disabled="isGeneratingBeats || !modelValue.summary"
            >
              <Wand2 v-if="!isGeneratingBeats" class="w-3 h-3" />
              <span v-else class="loading loading-spinner loading-xs"></span>
              Suggest Beats
            </button>
        </div>
        
        <RichTextEditor 
          :modelValue="summaryHtml"
          @update:modelValue="updateField('summary', $event)"
          class="min-h-[200px]"
          placeholder="Describe the scene. Who is here? What changes? What are the stakes?"
        />
      </div>

      <!-- Characters Section (Chips) -->
      <div class="space-y-3">
         <label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-base-content/40">
           <User class="w-4 h-4" /> Characters
         </label>
         
         <div v-if="projectStore.characterOutline.length > 0" class="flex flex-wrap gap-2">
            <button 
               v-for="char in projectStore.characterOutline" 
               :key="char.id"
               @click="toggleCharacter(char.id)"
               class="btn btn-sm h-9 px-3 rounded-full border-2 transition-all"
               :class="modelValue.characters?.includes(char.id) 
                 ? 'btn-neutral border-neutral' 
                 : 'btn-ghost border-base-200 hover:border-base-300 text-base-content/60'"
             >
               <div class="w-2 h-2 rounded-full mr-1" :class="modelValue.characters?.includes(char.id) ? 'bg-success' : 'bg-base-content/20'"></div>
               {{ char.name }}
            </button>
         </div>
         <div v-else class="text-sm text-base-content/40 italic pl-1">
           No characters available. Add them in the Characters tab.
         </div>
      </div>

      <!-- Action Footer -->
      <div class="flex justify-end gap-3 pt-4">
        <button @click="$emit('cancel')" class="btn btn-ghost">Cancel</button>
        <button @click="$emit('save')" class="btn btn-primary px-8 shadow-md shadow-primary/20">
          {{ isNew ? 'Create Chapter' : 'Save Changes' }}
        </button>
      </div>

    </div>
  </div>

  <div v-if="showBeatsPrompt" class="modal modal-open">
    <div class="modal-box w-11/12 max-w-xl">
      <h3 class="font-bold text-lg mb-2">Customize Beat Suggestions</h3>
      <p class="text-sm opacity-70 mb-4">Describe the tone, pacing, or specific moments you want the AI to emphasize. Selected chapter characters will be included automatically.</p>
      <textarea
        v-model="beatsPrompt"
        class="textarea textarea-bordered w-full h-32"
        placeholder="Focus on..."
      ></textarea>
      <div class="modal-action">
        <button class="btn btn-ghost" @click="showBeatsPrompt = false" :disabled="isGeneratingBeats">Cancel</button>
        <button class="btn btn-primary" :disabled="isGeneratingBeats" @click="suggestBeats(beatsPrompt.trim()); showBeatsPrompt = false">
          <span v-if="!isGeneratingBeats">Generate Beats</span>
          <span v-else class="loading loading-spinner loading-xs"></span>
        </button>
      </div>
    </div>
    <div class="modal-backdrop" @click="showBeatsPrompt = false"></div>
  </div>
</template>

<style scoped>
.input-ghost:focus, .textarea-ghost:focus {
  background-color: transparent;
  box-shadow: none;
}
</style>
