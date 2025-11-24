<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../stores/project'
import { generateText, streamText } from '../services/ai'
import { AI_PROMPTS } from '../constants/prompts'
import { Wand2, ArrowRight, CheckCircle2, Loader2, Play, AlertCircle, Sparkles } from 'lucide-vue-next'
import RichTextEditor from './RichTextEditor.vue'
import { marked } from 'marked'

const projectStore = useProjectStore()

const isOpen = ref(false)
const currentStep = ref<'logline' | 'synopsis' | 'characters' | 'outline'>('logline')
const isGenerating = ref(false)
const isCleaningLogline = ref(false)
const error = ref('')
const synopsisPrompt = ref('Deliver a cinematic three-act synopsis with escalating stakes and a hook at every act break.')
const selectedCharacters = ref<string[]>([])
const plainSynopsis = ref('')

// Steps Metadata
const steps = [
  { id: 'logline', label: 'Logline' },
  { id: 'synopsis', label: 'Synopsis' },
  { id: 'characters', label: 'Characters' },
  { id: 'outline', label: 'Outline' }
]

const currentStepIndex = computed(() => steps.findIndex(s => s.id === currentStep.value))

// ----------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------

function stripHtml(html: string) {
  const tmp = document.createElement("DIV")
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ""
}

async function cleanupLogline() {
  if (!projectStore.bookMetadata.logline) return
  isCleaningLogline.value = true
  
  try {
    const plainLogline = stripHtml(projectStore.bookMetadata.logline)
    const prompt = `Rewrite this logline to be more punchy, ironic, and commercial (under 50 words): "${plainLogline}"`
    const result = await generateText(prompt, '', 'outline', AI_PROMPTS.LOGLINE_DOCTOR)
    if (result) {
       const cleanResult = result.replace(/^"|"$/g, '')
       // Convert to HTML for Tiptap
       projectStore.bookMetadata.logline = await marked.parse(cleanResult)
    }
  } catch (e) {
    console.error(e)
  } finally {
    isCleaningLogline.value = false
  }
}

async function generateSynopsis() {
  if (!projectStore.bookMetadata.logline) return
  isGenerating.value = true
  error.value = ''
  projectStore.bookMetadata.synopsis = '' // Clear previous
  plainSynopsis.value = ''
  currentStep.value = 'synopsis' // Move to next step immediately to show streaming
  
  let markdownBuffer = ''

  try {
    const plainLogline = stripHtml(projectStore.bookMetadata.logline)
    const characterContext = selectedCharacters.value
      .map(id => projectStore.characterOutline.find(c => c.id === id))
      .filter(Boolean)
      .map(c => `${c!.name}: ${stripHtml(c!.bio)}`)
      .join('\n')
    const promptParts = [
      `Logline: ${plainLogline}`,
      characterContext ? `Characters to highlight:\n${characterContext}` : '',
      synopsisPrompt.value ? `Author Instructions: ${synopsisPrompt.value}` : ''
    ].filter(Boolean)
    const finalPrompt = promptParts.join('\n\n')

    const stream = streamText(
      finalPrompt, 
      'outline', 
      AI_PROMPTS.SYNOPSIS_GENERATOR
    )

    for await (const chunk of stream) {
      markdownBuffer += chunk
      plainSynopsis.value = markdownBuffer
      projectStore.bookMetadata.synopsis = await marked.parse(markdownBuffer)
    }

  } catch (e) {
    error.value = 'Failed to generate synopsis.'
    console.error(e)
    currentStep.value = 'logline' // Go back on error
  } finally {
    isGenerating.value = false
  }
}

async function generateCharacters() {
  if (!projectStore.bookMetadata.synopsis) return
  isGenerating.value = true
  error.value = ''
  
  try {
    const sourceSynopsis = plainSynopsis.value || stripHtml(projectStore.bookMetadata.synopsis)
    const result = await generateText(
      `Synopsis: ${sourceSynopsis}`, 
      '', 
      'outline', 
      AI_PROMPTS.CHARACTER_EXTRACTOR
    )
    
    const jsonMatch = result.match(/\[.*\]/s)
    if (jsonMatch) {
      const chars = JSON.parse(jsonMatch[0])
      // Clear existing (or maybe append? Let's clear for this "Wizard" flow)
      // Ideally we'd ask, but let's just append for safety or check for dupes.
      // For the wizard, let's assume we want to populate the list.
      
      chars.forEach((c: any) => {
         projectStore.addCharacter({
            name: c.name,
            role: c.role,
            bio: c.bio,
            traits: c.traits
         })
      })
      
      currentStep.value = 'characters'
    } else {
      throw new Error('Invalid JSON response')
    }
  } catch (e) {
    error.value = 'Failed to extract characters.'
    console.error(e)
  } finally {
    isGenerating.value = false
  }
}

async function generateOutline() {
  if (!projectStore.bookMetadata.synopsis) return
  isGenerating.value = true
  error.value = ''
  
  try {
    const sourceSynopsis = plainSynopsis.value || stripHtml(projectStore.bookMetadata.synopsis)
    const charContext = projectStore.characterOutline.map(c => `${c.name} (${c.role})`).join(', ')
    const result = await generateText(
      `Synopsis: ${sourceSynopsis}\nCharacters: ${charContext}`, 
      '', 
      'outline', 
      AI_PROMPTS.OUTLINE_FROM_CONTEXT
    )
    
    const jsonMatch = result.match(/\[.*\]/s)
    if (jsonMatch) {
      const chapters = JSON.parse(jsonMatch[0])
      
      // Clear existing chapters (e.g., the default Chapter 1)
      projectStore.storyOutline = []

      chapters.forEach((c: any) => {
        // Find character IDs based on names returned by AI
        const charIds: string[] = []
        if (c.characters && Array.isArray(c.characters)) {
          c.characters.forEach((name: string) => {
             const match = projectStore.characterOutline.find(char => char.name.toLowerCase().includes(name.toLowerCase()))
             if (match) charIds.push(match.id)
          })
        }

        projectStore.addChapter({
          title: c.title,
          summary: c.summary,
          status: 'idea',
          characters: charIds
        })
      })
      
      currentStep.value = 'outline'
    } else {
      throw new Error('Invalid JSON response')
    }
  } catch (e) {
    error.value = 'Failed to generate outline.'
    console.error(e)
  } finally {
    isGenerating.value = false
  }
}

function finish() {
  isOpen.value = false
  currentStep.value = 'logline' // Reset for next time
}
</script>

<template>
  <div>
    <!-- Trigger Button -->
    <button @click="isOpen = true" class="btn btn-outline gap-2">
      <Wand2 class="w-4 h-4" />
      Story Wizard
    </button>

    <!-- Modal -->
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div class="bg-base-100 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-base-200 relative">
        
        <!-- Header / Stepper -->
        <div class="bg-base-200/50 p-6 border-b border-base-200">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold flex items-center gap-2">
              <Wand2 class="w-6 h-6 text-primary" />
              Story Generator
            </h2>
            <button @click="isOpen = false" class="btn btn-sm btn-circle btn-ghost">✕</button>
          </div>
          
          <ul class="steps w-full">
             <li 
               v-for="(step, idx) in steps" 
               :key="step.id"
               class="step transition-all duration-300"
               :class="{ 'step-primary': idx <= currentStepIndex }"
             >
               {{ step.label }}
             </li>
          </ul>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-y-auto p-8 bg-base-100 relative">
           
           <!-- Loading Overlay -->
           <div v-if="isGenerating && (currentStep !== 'synopsis' || !projectStore.bookMetadata.synopsis)" class="absolute inset-0 bg-base-100/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-primary transition-opacity duration-300">
              <Loader2 class="w-12 h-12 animate-spin mb-4" />
              <p class="text-lg font-medium animate-pulse">AI is dreaming...</p>
           </div>

           <Transition name="slide-fade" mode="out-in">
             <!-- STEP 1: LOGLINE -->
             <div v-if="currentStep === 'logline'" key="logline" class="space-y-6">
                <div class="prose">
                  <h3>Start with a Hook</h3>
                  <p>Enter a one-sentence logline. The AI will use this to generate everything else.</p>
                </div>
                <div class="relative">
                  <RichTextEditor 
                    v-model="projectStore.bookMetadata.logline" 
                    class="min-h-[8rem]"
                    placeholder="e.g. A retired space pirate is forced back into action when his estranged daughter is kidnapped by the Galactic Navy."
                  />

                  <div class="flex justify-between items-center pt-2">
                    <!-- Cleanup Button -->
                    <button 
                      @click="cleanupLogline"
                      class="btn btn-ghost text-secondary gap-2"
                      :disabled="isCleaningLogline || !projectStore.bookMetadata.logline"
                    >
                      <Sparkles v-if="!isCleaningLogline" class="w-4 h-4" />
                      <span v-else class="loading loading-spinner loading-xs"></span>
                      Polish with AI
                    </button>

                    <button @click="generateSynopsis" class="btn btn-primary btn-lg gap-2" :disabled="!projectStore.bookMetadata.logline">
                      Generate Synopsis <ArrowRight class="w-5 h-5" />
                    </button>
                  </div>
                </div>
             </div>

             <!-- STEP 2: SYNOPSIS -->
             <div v-else-if="currentStep === 'synopsis'" key="synopsis" class="space-y-6">
                <div class="prose">
                  <h3>Review Synopsis</h3>
                  <p>Here is the story the AI expanded. Edit it now to ensure the characters and plot are correct before proceeding.</p>
                </div>
                <div class="space-y-4">
                  <label class="text-sm font-semibold text-base-content/70 flex justify-between items-center">
                    <span>Optional Prompt</span>
                    <span class="text-xs opacity-60">Guide the AI before regenerating</span>
                  </label>
                  <textarea
                    v-model="synopsisPrompt"
                    class="textarea textarea-bordered w-full h-24"
                    placeholder="Ask for focus on tone, genre, themes..."
                  ></textarea>

                  <div>
                    <label class="text-sm font-semibold text-base-content/70 mb-2 flex items-center justify-between">
                      <span>Characters to weave into synopsis</span>
                      <span class="text-xs opacity-70">Select any</span>
                    </label>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="char in projectStore.characterOutline"
                        :key="char.id"
                        type="button"
                        class="btn btn-xs rounded-full"
                        :class="selectedCharacters.includes(char.id) ? 'btn-neutral' : 'btn-ghost border-base-300'"
                        @click="selectedCharacters = selectedCharacters.includes(char.id)
                          ? selectedCharacters.filter(id => id !== char.id)
                          : [...selectedCharacters, char.id]"
                      >
                        {{ char.name }}
                      </button>
                      <span v-if="projectStore.characterOutline.length === 0" class="text-sm opacity-60 italic">No characters yet.</span>
                    </div>
                  </div>

                  <RichTextEditor 
                    v-model="projectStore.bookMetadata.synopsis" 
                    min-height="24rem"
                    placeholder="Once upon a time..."
                  />
                </div>
                <div class="flex justify-end gap-3">
                  <button @click="currentStep = 'logline'" class="btn btn-ghost">Back</button>
                  <button @click="generateCharacters" class="btn btn-primary btn-lg gap-2">
                    Extract Characters <ArrowRight class="w-5 h-5" />
                  </button>
                </div>
             </div>

             <!-- STEP 3: CHARACTERS -->
             <div v-else-if="currentStep === 'characters'" key="characters" class="space-y-6">
                <div class="prose mb-4">
                  <h3>Meet the Cast</h3>
                  <p>The AI found these characters. You can edit them later in the Characters tab.</p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div v-for="char in projectStore.characterOutline" :key="char.id" class="card bg-base-200 border border-base-300 p-4 flex-row items-start gap-4">
                      <div class="avatar placeholder">
                        <div class="bg-neutral text-neutral-content rounded-full w-12 h-12">
                          <span class="text-lg font-bold">{{ char.name[0] }}</span>
                        </div>
                      </div>
                      <div>
                        <div class="font-bold text-lg">{{ char.name }}</div>
                        <div class="text-xs uppercase opacity-60 font-bold">{{ char.role }}</div>
                        <div class="text-sm opacity-70 mt-1 line-clamp-2">{{ char.bio }}</div>
                      </div>
                   </div>
                </div>

                <div class="flex justify-end gap-3 mt-8">
                  <button @click="currentStep = 'synopsis'" class="btn btn-ghost">Back</button>
                  <button @click="generateOutline" class="btn btn-primary btn-lg gap-2">
                    Generate Outline <ArrowRight class="w-5 h-5" />
                  </button>
                </div>
             </div>

             <!-- STEP 4: OUTLINE -->
             <div v-else-if="currentStep === 'outline'" key="outline" class="space-y-6 text-center py-10">
                <div class="w-20 h-20 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 class="w-10 h-10" />
                </div>
                <h2 class="text-3xl font-bold">Story Bible Created!</h2>
                <p class="text-lg opacity-60 max-w-md mx-auto">
                  Your logline, synopsis, characters, and chapter outline have been generated and saved.
                </p>
                <button @click="finish" class="btn btn-primary btn-lg px-12 mt-6">
                  Start Writing
                </button>
             </div>
           </Transition>

        </div>

        <!-- Error Toast inside modal -->
        <div v-if="error" class="absolute bottom-4 left-1/2 -translate-x-1/2 alert alert-error w-auto shadow-lg animate-in slide-in-from-bottom-2">
          <AlertCircle class="w-5 h-5" />
          <span>{{ error }}</span>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Transitions */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
