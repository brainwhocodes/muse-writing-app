<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import StarterKit from '@tiptap/starter-kit'
import BubbleMenuExtension from '@tiptap/extension-bubble-menu'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import { Wand2, Check, X, Bold, Italic, ChevronDown, FileText, PanelRightOpen, PanelRightClose, UserCircle2 } from 'lucide-vue-next'
import { useEditorStore } from '../stores/editor'
import { useProjectStore } from '../stores/project'
import { generateText, streamText } from '../services/ai'
import { AI_PROMPTS } from '../constants/prompts'
import { marked } from 'marked'
import DiffViewer from '../components/DiffViewer.vue'

const editorStore = useEditorStore()
const projectStore = useProjectStore()

const currentChapterId = ref<string | null>(null)
const showSidebar = ref(true)
const pageCount = ref(1)
const editorContainer = ref<HTMLElement | null>(null)

// Page dimensions (11 inches at 96 DPI)
const PAGE_HEIGHT_PIXELS = 11 * 96 // 1056px total height per page

// Computed property for the current chapter
const currentChapter = computed(() => {
  return projectStore.storyOutline.find(c => c.id === currentChapterId.value) || null
})

// Calculate pages based on content height
function updatePageCount() {
  if (!editorContainer.value) return
  
  // Use setTimeout to ensure DOM has updated
  setTimeout(() => {
    if (!editorContainer.value) return
    // Use full scrollHeight (including padding) to calculate pages
    const contentHeight = editorContainer.value.scrollHeight
    const calculatedPages = Math.max(1, Math.ceil(contentHeight / PAGE_HEIGHT_PIXELS))
    pageCount.value = calculatedPages
  }, 100)
}

// Computed characters in this chapter
const chapterCharacters = computed(() => {
  if (!currentChapter.value || !currentChapter.value.characters) return []
  return projectStore.characterOutline.filter(c => currentChapter.value!.characters?.includes(c.id))
})

function stripHtml(html: string) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

function isHtml(content: string) {
  return /<[a-z][\s\S]*>/i.test(content)
}

function getContentType(value: string | undefined | null) {
  if (!value || value.trim().length === 0) return 'html'
  return isHtml(value) ? 'html' : 'markdown'
}

const currentChapterSummaryHtml = computed(() => {
  const content = currentChapter.value?.summary || ''
  if (!content) return ''
  if (isHtml(content)) {
    return content
  }
  const parsed = marked.parse(content, { async: false }) as string
  return parsed
})

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit,
    BubbleMenuExtension.configure({
      shouldShow: ({ editor }) => {
        return !editor.state.selection.empty && editor.isEditable
      },
    }),
    Placeholder.configure({
      placeholder: 'Start writing your chapter...',
    }),
    Markdown,
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-lg max-w-none focus:outline-none font-serif text-lg leading-relaxed',
    },
  },
  onUpdate: ({ editor }) => {
    const html = editor.getHTML()
    editorStore.setContent(html)
    
    // Auto-save content to the store if a chapter is selected
    if (currentChapterId.value) {
       projectStore.updateChapter(currentChapterId.value, { content: html })
    }
    
    // Update page count when content changes
    updatePageCount()
  },
})

// Watch for chapter selection changes to load content
watch(currentChapterId, (newId) => {
  if (newId && editor.value) {
    const chapter = projectStore.storyOutline.find(c => c.id === newId)
    if (chapter) {
      const chapterContent = chapter.content || ''
      editor.value.commands.setContent(chapterContent, { contentType: getContentType(chapterContent) })
      // Update page count after content loads
      updatePageCount()
    }
  }
})

// Watch for store changes (in case loaded from DB)
watch(() => projectStore.storyOutline, (chapters) => {
   if (!currentChapterId.value && chapters.length > 0) {
      currentChapterId.value = chapters[0].id
   }
}, { immediate: true })

// Initial page count calculation
onMounted(() => {
  updatePageCount()
})


const promptInput = ref('')
const showPromptInput = ref(false)
const currentSelectionRange = ref<{from: number, to: number} | null>(null)

// Clean up
onBeforeUnmount(() => {
  editor.value?.destroy()
})

// AI Actions
async function generateChapter() {
  if (!currentChapter.value || !editor.value) return
  
  editorStore.isGenerating = true
  
  try {
    const synopsis = stripHtml(currentChapter.value.summary)
    const chars = chapterCharacters.value.map(c => `${c.name}: ${c.bio}`).join('\n')
    const prompt = `Chapter Synopsis: ${synopsis}\n\nCharacters present:\n${chars}`
    
    // Clear editor to start fresh (or append? Let's assume fresh for "Generate" button)
    editor.value.commands.setContent('')
    
    let markdownBuffer = ''
    const stream = streamText(prompt, 'outline', AI_PROMPTS.CHAPTER_WRITER)

    for await (const chunk of stream) {
      markdownBuffer += chunk
      // Let TipTap's Markdown extension parse the markdown directly
      editor.value.commands.setContent(markdownBuffer, { contentType: 'markdown' })
    }

  } catch (e) {
    console.error('Generation failed:', e)
    alert('Failed to generate chapter.')
  } finally {
    editorStore.isGenerating = false
  }
}

async function handleAiPrompt() {
  if (!editor.value) return
  
  const selection = editor.value.state.selection
  const text = editor.value.state.doc.textBetween(selection.from, selection.to)
  
  if (!text.trim()) return

  currentSelectionRange.value = { from: selection.from, to: selection.to }
  
  try {
    editorStore.startGeneration()
    const result = await generateText(promptInput.value, text, 'selection')
    editorStore.finishGeneration(result, text)
    showPromptInput.value = false // Close the bubble menu input
    promptInput.value = '' // Reset input
  } catch (error) {
    console.error(error)
    alert('Failed to generate text. Check settings.')
    editorStore.isGenerating = false
  }
}

function applyChanges() {
  if (!editor.value || !currentSelectionRange.value) return
  
  // Replace the selection with the new content
  editor.value.chain().focus()
    .setTextSelection(currentSelectionRange.value)
    .insertContent(editorStore.suggestedContent)
    .run()
    
  editorStore.acceptDiff()
}

function cancelChanges() {
  editorStore.rejectDiff()
}
</script>

<template>
  <div class="relative h-full flex flex-col bg-base-200/50">
    <!-- Toolbar / Header -->
    <div class="navbar bg-base-100 border-b border-base-300 px-6 min-h-[4rem] sticky top-0 z-10 flex justify-between">
      <div class="flex-1 flex items-center gap-4">
        <!-- Chapter Selector Dropdown -->
        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-ghost text-xl font-bold gap-2 normal-case px-2">
             <span class="w-2 h-2 rounded-full" :class="currentChapter?.status === 'complete' ? 'bg-success' : 'bg-warning'"></span>
             {{ currentChapter?.title || 'Select a Chapter' }}
             <ChevronDown class="w-4 h-4 opacity-50" />
          </div>
          <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-72 max-h-96 overflow-y-auto flex-nowrap">
            <li v-for="chapter in projectStore.storyOutline" :key="chapter.id">
               <a @click="currentChapterId = chapter.id" :class="{ 'active': currentChapterId === chapter.id }">
                 <FileText class="w-4 h-4 opacity-70" />
                 <span class="truncate">{{ chapter.title }}</span>
               </a>
            </li>
             <li v-if="projectStore.storyOutline.length === 0" class="text-center p-4 text-sm opacity-50">
                No chapters yet. Create an outline first!
             </li>
          </ul>
        </div>
      </div>

      <div class="flex-none flex items-center gap-2">
        <!-- Generate Chapter Button (when empty) -->
        <button 
          v-if="currentChapterId && editor && editor.getText().trim() === '' && !editorStore.isGenerating"
          @click="generateChapter" 
          class="btn btn-primary gap-2"
        >
          <Wand2 class="w-4 h-4" />
          Generate Chapter
        </button>

        <div v-if="editorStore.isGenerating" class="flex items-center gap-2 text-primary animate-pulse font-medium mr-4">
          <Wand2 class="w-4 h-4 animate-spin" />
          Writing...
        </div>

        <!-- Toggle Sidebar -->
        <button @click="showSidebar = !showSidebar" class="btn btn-ghost btn-circle" title="Toggle Synopsis">
           <PanelRightOpen v-if="!showSidebar" class="w-5 h-5" />
           <PanelRightClose v-else class="w-5 h-5" />
        </button>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden relative">
      <!-- Main Editor Area -->
      <div class="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center relative bg-base-200">
        <div v-if="!currentChapterId" class="flex flex-col items-center justify-center h-96 text-base-content/40">
           <FileText class="w-16 h-16 mb-4 opacity-20" />
           <p class="text-lg">Select a chapter to start writing</p>
        </div>
        
        <!-- Multi-page editor container -->
        <div v-else class="editor-pages w-full max-w-[8.5in] py-8 pb-24">
          <!-- Render visual pages as backgrounds -->
          <div 
            v-for="pageNum in pageCount" 
            :key="`page-${pageNum}`"
            class="editor-page-frame bg-white shadow-lg border border-base-300 relative"
            :class="{ 'page-divider': pageNum < pageCount }"
          >
            <!-- Page number indicator -->
            <div class="absolute bottom-2 right-4 text-xs text-base-content/30 pointer-events-none z-20">
              Page {{ pageNum }}
            </div>
          </div>
          
          <!-- Editor content flows over all pages -->
          <div ref="editorContainer" class="editor-content-overlay">
            <editor-content :editor="editor" />
          </div>
        </div>
        
        <!-- Bubble Menu (existing) -->
        <bubble-menu v-if="editor" :editor="editor" :tippy-options="{ duration: 100, placement: 'bottom' }" class="bg-base-300 shadow-xl rounded-full p-1 flex items-center gap-1 border border-base-content/10 transform -translate-y-2">
          <!-- ... same content as before ... -->
          <div v-if="!showPromptInput" class="flex items-center p-1">
            <button @click="showPromptInput = true" class="btn btn-sm btn-primary rounded-full px-4 shadow-sm hover:shadow-md transition-all">
              <Wand2 class="w-4 h-4 mr-1" />
              AI Edit
            </button>
            <div class="w-px h-6 bg-base-content/10 mx-2"></div>
            <button @click="editor.chain().focus().toggleBold().run()" :class="{ 'bg-base-content/10 text-primary': editor.isActive('bold') }" class="btn btn-sm btn-ghost btn-square rounded-full"><Bold class="w-4 h-4" /></button>
            <button @click="editor.chain().focus().toggleItalic().run()" :class="{ 'bg-base-content/10 text-primary': editor.isActive('italic') }" class="btn btn-sm btn-ghost btn-square rounded-full"><Italic class="w-4 h-4" /></button>
          </div>
          <div v-else class="flex gap-2 items-center p-1 animate-in fade-in zoom-in duration-200">
            <div class="join shadow-sm">
              <input v-model="promptInput" @keyup.enter="handleAiPrompt" type="text" placeholder="How should I change this?" class="input input-sm input-bordered join-item w-64 focus:outline-none" autoFocus />
              <button @click="handleAiPrompt" class="btn btn-sm btn-primary join-item"><Wand2 class="w-4 h-4" /></button>
            </div>
            <button @click="showPromptInput = false" class="btn btn-sm btn-circle btn-ghost"><X class="w-4 h-4" /></button>
          </div>
        </bubble-menu>
      </div>

      <!-- Sidebar -->
      <div v-if="showSidebar && currentChapter" class="w-80 bg-base-100 border-l border-base-300 flex flex-col shadow-xl z-20 animate-in slide-in-from-right duration-300">
         <div class="p-6 overflow-y-auto flex-1">
            <h3 class="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Chapter Synopsis</h3>
            <div class="prose prose-sm mb-8" v-html="currentChapterSummaryHtml"></div>

            <h3 class="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Characters Present</h3>
            <div class="space-y-3">
               <div v-for="char in chapterCharacters" :key="char.id" class="flex items-start gap-3 p-2 rounded-lg bg-base-200/50">
                  <div class="avatar">
                    <div class="w-8 h-8 rounded-full text-base-content/40">
                      <UserCircle2 class="w-full h-full" />
                    </div>
                  </div>
                  <div>
                     <div class="font-bold text-sm">{{ char.name }}</div>
                     <div class="text-xs opacity-60 line-clamp-2">{{ char.bio }}</div>
                  </div>
               </div>
               <div v-if="chapterCharacters.length === 0" class="text-sm opacity-50 italic">
                  No characters tagged in this chapter.
               </div>
            </div>
         </div>
      </div>
    </div>
    
    <!-- Diff Modal (same as before) -->
    <div v-if="editorStore.showDiff" class="modal modal-open backdrop-blur-sm">
       <!-- ... same content ... -->
       <div class="modal-box w-11/12 max-w-4xl shadow-2xl border border-base-200">
        <div class="flex justify-between items-center mb-6">
           <h3 class="font-bold text-xl flex items-center gap-2"><Wand2 class="w-5 h-5 text-primary" />Review Suggestions</h3>
           <div class="text-sm text-base-content/60">Review changes before applying</div>
        </div>
        <div class="grid grid-cols-1 gap-4 mb-6">
          <div class="bg-base-100 p-6 rounded-xl border border-base-200 shadow-inner max-h-[60vh] overflow-y-auto">
            <DiffViewer :original="editorStore.originalContent" :suggested="editorStore.suggestedContent" />
          </div>
        </div>
        <div class="modal-action border-t border-base-200 pt-4 mt-0">
          <button @click="cancelChanges" class="btn btn-ghost hover:bg-base-200">Reject</button>
          <button @click="applyChanges" class="btn btn-primary px-8"><Check class="w-4 h-4 mr-2" />Accept Changes</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style>
/* Tiptap Prose Overrides */
.ProseMirror {
  outline: none;
  min-height: 100%;
}

.ProseMirror p.is-editor-empty:first-child::before {
  color: #adb5bd;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

/* Page-like styling */
.editor-pages {
  position: relative;
  min-height: 100vh;
}

.editor-page-frame {
  width: 8.5in;
  height: 11in;
  margin: 0 auto;
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 10px 30px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.3s ease;
  pointer-events: none; /* Allow clicks to pass through to editor */
}

/* Visual page divider (no gap, just shadow effect) */
.page-divider {
  position: relative;
}

.page-divider::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 10px;
  background: linear-gradient(to bottom, 
    rgba(0, 0, 0, 0.1) 0%, 
    rgba(0, 0, 0, 0.05) 50%, 
    rgba(0, 0, 0, 0) 100%);
  pointer-events: none;
  z-index: 15;
}

.editor-page-frame:hover {
  box-shadow: 
    0 2px 6px rgba(0, 0, 0, 0.15),
    0 15px 40px rgba(0, 0, 0, 0.12);
}

.editor-content-overlay {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 8.5in;
  z-index: 10;
}

.editor-content-overlay .ProseMirror {
  min-height: var(--page-height);
  padding: 1in 1in 1.5in;
  width: 100%;
  box-sizing: border-box;
  text-indent: 1.5em;
}

.editor-content-overlay .ProseMirror > p {
  text-indent: 1.5em;
  margin-top: 0.75rem;
}

.editor-content-overlay .ProseMirror > p:first-child {
  margin-top: 0;
}

.editor-content-overlay .ProseMirror strong,
.editor-content-overlay .ProseMirror b {
  font-weight: 700;
}

/* Improve scrollbar in editor container */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Print styles */
@media print {
  .editor-page {
    box-shadow: none;
    border: none;
    margin: 0;
    padding: 0;
    page-break-after: always;
  }
}
</style>
