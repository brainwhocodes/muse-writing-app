<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../stores/project'
import { generateText } from '../services/ai'
import { AI_PROMPTS } from '../constants/prompts'
import { Sparkles, User, PenTool, Book, Tag, RefreshCw, FileText, Users, Globe, Anchor, TrendingUp } from 'lucide-vue-next'
import RichTextEditor from './RichTextEditor.vue'
import { marked } from 'marked'

const projectStore = useProjectStore()
const isGeneratingLogline = ref(false)
const isGeneratingSynopsis = ref(false)
const showOriginalPremise = ref(false)
const activeTab = ref('pillars')

const hasChapters = computed(() => projectStore.storyOutline.length > 0)

const tabs = [
  { id: 'pillars', label: 'Core Pillars', icon: Anchor, color: 'text-primary' },
  { id: 'narrative', label: 'Narrative Flow', icon: TrendingUp, color: 'text-secondary' },
  { id: 'world', label: 'World Building', icon: Globe, color: 'text-accent' },
  { id: 'cast', label: 'Cast & Terminology', icon: Users, color: 'text-info' },
]

function stripHtml(html: string) {
  const tmp = document.createElement("DIV")
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ""
}

async function refineLogline() {
  if (isGeneratingLogline.value) return
  isGeneratingLogline.value = true
  
  try {
    const metadata = projectStore.bookMetadata
    const systemPrompt = AI_PROMPTS.LOGLINE_DOCTOR
    const plainLogline = stripHtml(metadata.logline)
    const plainSynopsis = stripHtml(metadata.synopsis)
    
    const context = `
    BOOK DETAILS:
    Title: ${metadata.title}
    Genre: ${metadata.genre}
    Synopsis: ${plainSynopsis}
    `
    
    const userPrompt = plainLogline 
      ? `Rewrite and polish the following logline to be more punchy and commercial:\n"${plainLogline}"\n\nContext:\n${context}`
      : `Generate a killer logline for the following story:\n${context}`

    const result = await generateText(userPrompt, '', 'outline', systemPrompt)
    
    if (result) {
      // Remove quotes if AI adds them
      const cleanResult = result.replace(/^"|"$/g, '').trim()
      projectStore.bookMetadata.logline = await marked.parse(cleanResult)
    }
  } catch (e) {
    console.error(e)
    // meaningful error handling or toast could go here
  } finally {
    isGeneratingLogline.value = false
  }
}

async function regenerateSynopsis() {
  if (isGeneratingSynopsis.value || !hasChapters.value) return
  isGeneratingSynopsis.value = true
  
  try {
    const metadata = projectStore.bookMetadata
    const chapters = projectStore.storyOutline
    const characters = projectStore.characterOutline
    
    // Build context from chapters
    const chapterSummaries = chapters
      .map((c, i) => `${i + 1}. ${c.title}: ${c.summary}`)
      .join('\n')
    
    const characterList = characters
      .map(c => `- ${c.name} (${c.role}): ${c.traits}`)
      .join('\n')
    
    const prompt = `BOOK: ${metadata.title}
GENRE: ${metadata.genre}
${metadata.originalPremise ? `ORIGINAL PREMISE: ${metadata.originalPremise}\n` : ''}
CHAPTERS:
${chapterSummaries}

CHARACTERS:
${characterList || 'Not specified'}

Generate a compelling synopsis that captures the story arc based on these chapter summaries.`

    const result = await generateText(prompt, '', 'outline', AI_PROMPTS.SYNOPSIS_GENERATOR)
    
    if (result) {
      projectStore.bookMetadata.synopsis = await marked.parse(result)
    }
  } catch (e) {
    console.error('Failed to generate synopsis:', e)
  } finally {
    isGeneratingSynopsis.value = false
  }
}
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-5xl mx-auto pb-12">
    
    <!-- Header: Identity Section -->
    <div class="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
      
      <!-- Book Cover Placeholder -->
      <div class="aspect-2/3 bg-linear-to-br from-base-200 to-base-300 rounded-lg shadow-inner flex flex-col items-center justify-center text-base-content/20 border-2 border-dashed border-base-300 relative group overflow-hidden">
        <Book class="w-16 h-16 mb-4" />
        <span class="text-sm font-bold uppercase tracking-widest">Book Cover</span>
        
        <!-- Hover Overlay (Future: Upload) -->
        <div class="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
           <span class="text-xs font-bold bg-base-100 px-3 py-1 rounded-full shadow-sm">Upload</span>
        </div>
      </div>

      <!-- Core Metadata Inputs -->
      <div class="flex flex-col justify-center space-y-6">
        <!-- Title Input -->
        <div class="form-control">
          <input 
            v-model="projectStore.bookMetadata.title" 
            type="text" 
            class="input input-ghost text-2xl md:text-2xl w-2xl font-serif font-bold placeholder:text-base-content/20 focus:bg-transparent px-0 h-auto"
            placeholder="Untitled Masterpiece" 
          />
        </div>

        <!-- Author Input -->
        <div class="flex items-center gap-3 text-base-content/60">
          <User class="w-5 h-5" />
          <span class="text-lg">by</span>
          <input 
            v-model="projectStore.bookMetadata.author" 
            type="text" 
            class="input input-ghost input-sm text-lg font-medium placeholder:text-base-content/30 focus:bg-transparent px-2 -ml-2 w-full max-w-md"
            placeholder="Author Name" 
          />
        </div>

        <!-- Genre Input (Pill Style) -->
        <div class="flex items-center gap-3">
          <div class="badge badge-lg gap-2 pl-3 pr-1 py-4 bg-base-200 text-base-content/70 border-none">
            <Tag class="w-4 h-4" />
            <input 
              v-model="projectStore.bookMetadata.genre" 
              type="text" 
              class="bg-transparent focus:outline-none w-full max-w-48 placeholder:text-base-content/30 text-sm font-bold uppercase tracking-wide"
              placeholder="GENRE" 
            />
          </div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Logline ("The Hook") -->
    <div class="bg-base-100 rounded-xl border border-base-200 p-8 shadow-sm relative overflow-hidden group/logline">
      <div class="absolute top-0 left-0 w-1 h-full bg-primary"></div>
      <div class="flex items-start gap-4">
        <button 
          @click="refineLogline" 
          class="btn btn-ghost btn-square text-primary bg-primary/10 hover:bg-primary/20 transition-all"
          :class="{'loading': isGeneratingLogline}"
          title="Generate/Improve with AI"
        >
          <Sparkles v-if="!isGeneratingLogline" class="w-6 h-6" />
        </button>
        <div class="flex-1">
          <div class="flex justify-between items-center mb-2">
            <label class="text-xs font-bold uppercase tracking-wider text-base-content/40 block">Logline</label>
            <span class="text-xs text-base-content/30 opacity-0 group-hover/logline:opacity-100 transition-opacity">
              Click sparkles to generate
            </span>
          </div>
          <RichTextEditor 
            v-model="projectStore.bookMetadata.logline" 
            class="min-h-[4rem]"
            placeholder="Write a compelling one-sentence hook that captures the essence of your story..."
          />
        </div>
      </div>
    </div>

    <!-- Original Premise (if exists) -->
    <div v-if="projectStore.bookMetadata.originalPremise" class="bg-base-200/50 rounded-xl border border-base-200 overflow-hidden">
      <button 
        @click="showOriginalPremise = !showOriginalPremise"
        class="w-full flex items-center gap-3 p-4 hover:bg-base-200/50 transition-colors text-left"
      >
        <FileText class="w-4 h-4 text-base-content/50" />
        <span class="text-sm font-medium text-base-content/70">Original Generation Prompt</span>
        <span class="ml-auto text-xs text-base-content/40">{{ showOriginalPremise ? 'Hide' : 'Show' }}</span>
      </button>
      <div v-if="showOriginalPremise" class="px-4 pb-4">
        <div class="bg-base-100 rounded-lg p-4 text-sm text-base-content/70 whitespace-pre-wrap font-mono">
          {{ projectStore.bookMetadata.originalPremise }}
        </div>
      </div>
    </div>

    <!-- Synopsis ("The Story") -->
    <div class="card bg-white shadow-lg border border-base-200 rounded-lg">
      <div class="card-body p-8 md:p-12">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3 opacity-50">
            <PenTool class="w-5 h-5" />
            <h3 class="font-bold uppercase tracking-widest text-sm">Synopsis</h3>
          </div>
          <button 
            v-if="hasChapters"
            @click="regenerateSynopsis"
            class="btn btn-sm btn-ghost gap-2"
            :disabled="isGeneratingSynopsis"
            title="Generate synopsis from chapter outlines"
          >
            <RefreshCw v-if="!isGeneratingSynopsis" class="w-4 h-4" />
            <span v-else class="loading loading-spinner loading-xs"></span>
            {{ isGeneratingSynopsis ? 'Generating...' : 'Generate from Chapters' }}
          </button>
        </div>
        
        <RichTextEditor 
          v-model="projectStore.bookMetadata.synopsis" 
          min-height="400px"
          placeholder="Once upon a time..."
        />
        
        <p v-if="!hasChapters" class="text-xs text-base-content/40 mt-4">
          Tip: Add chapters to your outline, then click "Generate from Chapters" to create a synopsis automatically.
        </p>
      </div>
    </div>

    <!-- Story Bible (Master-Detail Layout) -->
    <div class="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
      <div class="flex flex-col md:flex-row min-h-[600px]">
        
        <!-- Sidebar -->
        <div class="w-full md:w-64 bg-base-200/40 border-b md:border-b-0 md:border-r border-base-200 flex flex-row md:flex-col overflow-x-auto md:overflow-visible">
          <div class="p-4 md:p-6 pb-2 md:pb-6">
            <div class="flex items-center gap-3 opacity-60 mb-2 md:mb-6 hidden md:flex">
              <Book class="w-5 h-5" />
              <h3 class="font-bold uppercase tracking-widest text-sm">Story Bible</h3>
            </div>
          </div>

          <div class="flex flex-row md:flex-col gap-1 px-2 md:px-4 pb-2 md:pb-4">
            <button 
              v-for="tab in tabs" 
              :key="tab.id"
              @click="activeTab = tab.id"
              class="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap md:whitespace-normal"
              :class="activeTab === tab.id ? 'bg-white shadow-sm text-base-content' : 'text-base-content/60 hover:bg-base-200 hover:text-base-content'"
            >
              <component :is="tab.icon" class="w-4 h-4 shrink-0" :class="activeTab === tab.id ? tab.color : ''" />
              {{ tab.label }}
            </button>
          </div>
        </div>

        <!-- Content Area -->
        <div class="flex-1 p-6 md:p-10 bg-white/50">
          
          <!-- Core Pillars -->
          <div v-if="activeTab === 'pillars'" class="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <div class="flex items-center gap-3 mb-6">
                <div class="p-2 bg-primary/10 rounded-lg text-primary">
                  <Anchor class="w-6 h-6" />
                </div>
                <div>
                  <h4 class="text-xl font-serif font-bold text-base-content">Core Pillars</h4>
                  <p class="text-xs text-base-content/50 uppercase tracking-wider font-medium">Thematic Foundation</p>
                </div>
              </div>
              
              <div class="space-y-6">
                <label class="form-control w-full flex flex-col">
                  <div class="label">
                    <span class="label-text font-bold">Core Themes</span>
                  </div>
                  <textarea 
                    v-model="projectStore.storyBible.coreThemes" 
                    class="textarea textarea-bordered min-h-[160px] text-base leading-relaxed focus:textarea-primary transition-all w-full" 
                    placeholder="e.g. The cyclical nature of violence, Redemption requires sacrifice..."
                  ></textarea>
                  <div class="label">
                    <span class="label-text-alt text-base-content/50">What is the central argument or question of your story?</span>
                  </div>
                </label>

                <label class="form-control w-full flex flex-col">
                  <div class="label">
                    <span class="label-text font-bold">Motifs & Symbols</span>
                  </div>
                  <textarea 
                    v-model="projectStore.storyBible.motifs" 
                    class="textarea textarea-bordered min-h-[120px] text-base leading-relaxed focus:textarea-primary transition-all w-full" 
                    placeholder="Recurring imagery (e.g. shattered mirrors, ravens, the color red)..."
                  ></textarea>
                  <div class="label">
                    <span class="label-text-alt text-base-content/50">Recurring imagery, objects, or phrases.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Narrative Flow -->
          <div v-if="activeTab === 'narrative'" class="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <div class="flex items-center gap-3 mb-6">
                <div class="p-2 bg-secondary/10 rounded-lg text-secondary">
                  <TrendingUp class="w-6 h-6" />
                </div>
                <div>
                  <h4 class="text-xl font-serif font-bold text-base-content">Narrative Flow</h4>
                  <p class="text-xs text-base-content/50 uppercase tracking-wider font-medium">Structure & Voice</p>
                </div>
              </div>

              <div class="space-y-6">
                <label class="form-control w-full flex flex-col">
                  <div class="label">
                    <span class="label-text font-bold">Narrative Arc</span>
                  </div>
                  <textarea 
                    v-model="projectStore.storyBible.narrativeArc" 
                    class="textarea textarea-bordered min-h-[200px] text-base leading-relaxed focus:textarea-secondary transition-all w-full" 
                    placeholder="Beginning: Status Quo... &#10;Inciting Incident: ... &#10;Midpoint: ... &#10;Climax: ... &#10;Resolution: ..."
                  ></textarea>
                  <div class="label">
                    <span class="label-text-alt text-base-content/50">The emotional or structural spine of the story.</span>
                  </div>
                </label>

                <label class="form-control w-full flex flex-col">
                  <div class="label">
                    <span class="label-text font-bold">Tone Guidelines</span>
                  </div>
                  <textarea 
                    v-model="projectStore.storyBible.toneGuidelines" 
                    class="textarea textarea-bordered min-h-[100px] text-base leading-relaxed focus:textarea-secondary transition-all w-full" 
                    placeholder="e.g. Dark, gritty, hopeful, fast-paced, contemplative..."
                  ></textarea>
                  <div class="label">
                    <span class="label-text-alt text-base-content/50">Atmosphere, voice, and pacing constraints.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- World Building -->
          <div v-if="activeTab === 'world'" class="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <div class="flex items-center gap-3 mb-6">
                <div class="p-2 bg-accent/10 rounded-lg text-accent">
                  <Globe class="w-6 h-6" />
                </div>
                <div>
                  <h4 class="text-xl font-serif font-bold text-base-content">World Building</h4>
                  <p class="text-xs text-base-content/50 uppercase tracking-wider font-medium">Setting & Rules</p>
                </div>
              </div>

              <div class="h-full">
                <label class="form-control w-full h-full flex flex-col">
                  <div class="label">
                    <span class="label-text font-bold">World Rules & Systems</span>
                  </div>
                  <textarea 
                    v-model="projectStore.storyBible.worldRules" 
                    class="textarea textarea-bordered min-h-[400px] text-base leading-relaxed focus:textarea-accent transition-all w-full" 
                    placeholder="Define the laws of your world here to ensure consistency..."
                  ></textarea>
                  <div class="label">
                    <span class="label-text-alt text-base-content/50">Magic systems, technology, geography, or societal rules.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <!-- Cast & Terminology -->
          <div v-if="activeTab === 'cast'" class="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <div class="flex items-center gap-3 mb-6">
                <div class="p-2 bg-info/10 rounded-lg text-info">
                  <Users class="w-6 h-6" />
                </div>
                <div>
                  <h4 class="text-xl font-serif font-bold text-base-content">Cast & Terminology</h4>
                  <p class="text-xs text-base-content/50 uppercase tracking-wider font-medium">Entities & Relationships</p>
                </div>
              </div>

              <div class="h-full">
                <label class="form-control w-full h-full flex flex-col">
                  <div class="label">
                    <span class="label-text font-bold">Character Terminologies & Relationships</span>
                  </div>
                  <textarea 
                    v-model="projectStore.storyBible.characterTerminologies" 
                    class="textarea textarea-bordered min-h-[400px] text-base leading-relaxed focus:textarea-info transition-all w-full" 
                    placeholder="e.g. The Emperor (never 'King'), Sarah hates John, The Guild of Thieves..."
                  ></textarea>
                  <div class="label">
                    <span class="label-text-alt text-base-content/50">Canonical names, titles, and relationship dynamics.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Remove default input/textarea outlines for the 'ghost' look */
.input-ghost:focus, .textarea-ghost:focus {
  background-color: transparent;
  box-shadow: none;
}
</style>
