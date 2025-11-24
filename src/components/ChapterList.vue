<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore, type StoryChapter } from '../stores/project'
import { Plus, Wand2, Sparkles } from 'lucide-vue-next'
import { generateText } from '../services/ai'
import { AI_PROMPTS } from '../constants/prompts'
import ChapterItem from './ChapterItem.vue'
import ChapterEditor from './ChapterEditor.vue'
import { marked } from 'marked'

const projectStore = useProjectStore()

// ---------------------------------------------------------
// State
// ---------------------------------------------------------
const isGenerating = ref(false)
const prompt = ref('')
const showGenerateModal = ref(false)
const showBatchModal = ref(false)
const isBatchGenerating = ref(false)
const batchProgress = ref('')
const overwriteExisting = ref(false)
const generatingChapterId = ref<string | null>(null)
const generatingTransitionId = ref<string | null>(null)

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
function stripHtml(html: string) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

function buildChapterPrompt(chapter: StoryChapter) {
  const plainLogline = stripHtml(projectStore.bookMetadata.logline || '')
  const plainSynopsis = stripHtml(projectStore.bookMetadata.synopsis || '')

  const index = projectStore.storyOutline.findIndex(c => c.id === chapter.id)
  const prevChapter = index > 0 ? projectStore.storyOutline[index - 1] : null
  const nextChapter = index < projectStore.storyOutline.length - 1 ? projectStore.storyOutline[index + 1] : null

  const prevSummary = prevChapter ? stripHtml(prevChapter.summary || '') : ''
  const nextSummary = nextChapter ? stripHtml(nextChapter.summary || '') : ''

  const characterDetails = (chapter.characters || [])
    .map(id => projectStore.characterOutline.find(char => char.id === id))
    .filter(Boolean)
    .map(char => `${char!.name} (${char!.role}): ${stripHtml(char!.bio)}`)
    .join('\n')

  const termContext = projectStore.terminology
    .filter(t => !t.chapters || t.chapters.length === 0 || t.chapters.includes(chapter.id))
    .map(t => `${t.term}: ${t.definition}${t.notes ? ` (${t.notes})` : ''}`)
    .join('\n')

  const parts = [
    plainLogline ? `Book Logline: ${plainLogline}` : '',
    plainSynopsis ? `Book Synopsis: ${plainSynopsis}` : '',
    `Chapter Title: ${chapter.title}`,
    `Chapter Synopsis: ${stripHtml(chapter.summary || '')}`,
    characterDetails ? `Characters in this chapter:\n${characterDetails}` : '',
    prevSummary ? `Previous Chapter Summary: ${prevSummary}` : '',
    nextSummary ? `Next Chapter Summary: ${nextSummary}` : '',
    termContext ? `Terminology to honor:\n${termContext}` : '',
    `Guidance: Maintain continuity with the previous chapter and set up the next chapter naturally.`
  ].filter(Boolean)

  return parts.join('\n\n')
}

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

async function batchGenerateChapters() {
  isBatchGenerating.value = true
  batchProgress.value = ''

  try {
    for (const chapter of projectStore.storyOutline) {
      // Skip chapters with existing content unless overwrite is enabled
      if (chapter.content && !overwriteExisting.value) continue

      const plainSummary = stripHtml(chapter.summary || '')
      if (!plainSummary) continue

      const chapterPrompt = buildChapterPrompt(chapter)
      batchProgress.value = `Generating ${chapter.title}...`

      const result = await generateText(chapterPrompt, '', 'outline', AI_PROMPTS.CHAPTER_WRITER)
      if (result) {
        const html = await marked.parse(result)
        projectStore.updateChapter(chapter.id, { content: html })
      }
    }

    showBatchModal.value = false
    overwriteExisting.value = false
  } catch (e) {
    console.error(e)
    alert('Failed to batch generate chapters')
  } finally {
    isBatchGenerating.value = false
    batchProgress.value = ''
  }
}

async function generateChapterDraft(chapterId: string) {
  const chapter = projectStore.storyOutline.find(c => c.id === chapterId)
  if (!chapter) return

  generatingChapterId.value = chapterId
  try {
    const chapterPrompt = buildChapterPrompt(chapter)
    const result = await generateText(chapterPrompt, '', 'outline', AI_PROMPTS.CHAPTER_WRITER)
    if (result) {
      const html = await marked.parse(result)
      projectStore.updateChapter(chapter.id, { content: html })
    }
  } catch (e) {
    console.error(e)
    alert('Failed to generate chapter')
  } finally {
    generatingChapterId.value = null
  }
}

async function generateTransition(chapterId: string) {
  const chapter = projectStore.storyOutline.find(c => c.id === chapterId)
  if (!chapter) return

  const index = projectStore.storyOutline.findIndex(c => c.id === chapterId)
  const nextChapter = index < projectStore.storyOutline.length - 1 ? projectStore.storyOutline[index + 1] : null
  if (!nextChapter) {
    alert('No next chapter to transition into.')
    return
  }

  generatingTransitionId.value = chapterId
  try {
    const promptParts = [
      `Current Chapter: ${chapter.title}`,
      `Current Summary: ${stripHtml(chapter.summary || '')}`,
      `Next Chapter: ${nextChapter.title}`,
      `Next Summary: ${stripHtml(nextChapter.summary || '')}`,
      `Goal: Write a short transition hook (1-2 paragraphs) that closes the current chapter and naturally sets up the opening of the next. Keep voice and tone consistent.`
    ]

    const prompt = promptParts.join('\n\n')
    const result = await generateText(prompt, '', 'outline', AI_PROMPTS.CHAPTER_WRITER)
    if (result) {
      const html = await marked.parse(result)
      const existingSummary = chapter.summary || ''
      const transitionBlock = `<p><strong>Transition to "${nextChapter.title}":</strong></p>${html}`
      projectStore.updateChapter(chapter.id, { summary: existingSummary + transitionBlock })
    }
  } catch (e) {
    console.error(e)
    alert('Failed to generate transition')
  } finally {
    generatingTransitionId.value = null
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
        <button @click="showBatchModal = true" class="btn btn-ghost btn-sm text-secondary">
          <Sparkles class="w-4 h-4 mr-2" />
          Batch Chapters
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
           :is-generating="generatingChapterId === chapter.id"
           :is-generating-transition="generatingTransitionId === chapter.id"
           @edit="startEdit"
           @generate="generateChapterDraft"
           @transition="generateTransition"
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

    <!-- Batch Generate Chapters Modal -->
    <div v-if="showBatchModal" class="modal modal-open backdrop-blur-sm z-50">
      <div class="modal-box shadow-2xl border border-base-200 max-w-xl">
        <h3 class="font-bold text-lg mb-2 flex items-center gap-2">
          <Sparkles class="w-5 h-5 text-secondary" />
          Batch Generate Chapters
        </h3>
        <p class="text-sm text-base-content/70 mb-4">
          Draft full chapters for each outline entry using its summary and tagged characters. Chapters without summaries are skipped.
        </p>

        <div class="form-control mb-4">
          <label class="label cursor-pointer justify-start gap-3">
            <input type="checkbox" class="checkbox" v-model="overwriteExisting" :disabled="isBatchGenerating">
            <span class="label-text">Overwrite chapters that already have content</span>
          </label>
        </div>

        <div v-if="batchProgress" class="alert alert-info mb-4">
          <span>{{ batchProgress }}</span>
        </div>

        <div class="modal-action">
          <button @click="showBatchModal = false" class="btn btn-ghost" :disabled="isBatchGenerating">Cancel</button>
          <button @click="batchGenerateChapters" class="btn btn-secondary px-6" :disabled="isBatchGenerating">
            <span v-if="isBatchGenerating" class="loading loading-spinner loading-xs mr-2"></span>
            {{ isBatchGenerating ? 'Generating...' : 'Generate Chapters' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
