<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { Book, List, ArrowUpDown, Hash } from 'lucide-vue-next'
import BookBible from '../components/BookBible.vue'
import ChapterList from '../components/ChapterList.vue'
import TerminologyPanel from '../components/TerminologyPanel.vue'

const projectStore = useProjectStore()
const activeTab = ref<'overview' | 'chapters' | 'terminology'>('overview')

function extractChapterNumber(title: string): number {
  const patterns = [
    /chapter\s*(\d+)/i,
    /^(\d+)\.\s*/,
    /^(\d+)\s*[-:]/,
  ]
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) return parseInt(match[1], 10)
  }
  const wordNumbers: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15
  }
  const wordMatch = title.toLowerCase().match(/chapter\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)/i)
  if (wordMatch) return wordNumbers[wordMatch[1].toLowerCase()] || 999
  return 999
}

function fixChapterOrder() {
  // Sort chapters by extracted number
  const sorted = [...projectStore.storyOutline].sort((a, b) => 
    extractChapterNumber(a.title) - extractChapterNumber(b.title)
  )
  // Update the store with sorted order
  projectStore.storyOutline.splice(0, projectStore.storyOutline.length, ...sorted)
}

function renumberChapters() {
  projectStore.storyOutline.forEach((chapter, index) => {
    const chapterNum = index + 1
    // Extract the title part after "Chapter X:" or similar
    let titlePart = chapter.title
      .replace(/^chapter\s*\d+\s*[:\-–—]\s*/i, '')
      .replace(/^\d+\.\s*/, '')
      .replace(/^\d+\s*[:\-–—]\s*/, '')
      .trim()
    
    // If title is empty or was just "Chapter X", give it a placeholder
    if (!titlePart || titlePart.toLowerCase().startsWith('chapter')) {
      titlePart = 'Untitled'
    }
    
    const newTitle = `Chapter ${chapterNum}: ${titlePart}`
    projectStore.updateChapter(chapter.id, { title: newTitle })
  })
}

function fixAndRenumber() {
  fixChapterOrder()
  renumberChapters()
}
</script>

<template>
  <div class="h-full flex flex-col bg-base-200/30">
    <!-- Header / Tabs -->
    <div class="navbar bg-base-100 border-b border-base-300 px-6 min-h-16 sticky top-0 z-10">
      <div class="flex-1 gap-4">
        <h1 class="text-xl font-bold mr-4">Outline</h1>
        <div class="join">
          <button 
            class="btn btn-sm join-item" 
            :class="activeTab === 'overview' ? 'btn-active btn-neutral' : 'btn-ghost'"
            @click="activeTab = 'overview'"
          >
            <Book class="w-4 h-4 mr-2" />
            Book Bible
          </button>
          <button 
            class="btn btn-sm join-item" 
            :class="activeTab === 'chapters' ? 'btn-active btn-neutral' : 'btn-ghost'"
            @click="activeTab = 'chapters'"
          >
            <List class="w-4 h-4 mr-2" />
            Chapters
          </button>
          <button 
            class="btn btn-sm join-item" 
            :class="activeTab === 'terminology' ? 'btn-active btn-neutral' : 'btn-ghost'"
            @click="activeTab = 'terminology'"
          >
            <Book class="w-4 h-4 mr-2" />
            Terminology
          </button>
        </div>
      </div>
    </div>

    <!-- CONTENT AREA -->
    <div class="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
      
      <!-- TAB: BOOK BIBLE (OVERVIEW) -->
      <div v-if="activeTab === 'overview' && projectStore.bookMetadata">
        <BookBible />
      </div>

      <!-- TAB: CHAPTERS -->
      <div v-else-if="activeTab === 'chapters'">
        <!-- Chapter Tools -->
        <div v-if="projectStore.storyOutline.length > 0" class="flex items-center gap-2 mb-4 p-3 rounded-lg bg-base-200/50 border border-base-200">
          <span class="text-sm text-base-content/60 mr-2">Tools:</span>
          <button 
            @click="fixChapterOrder" 
            class="btn btn-sm btn-ghost gap-1"
            title="Sort chapters by their chapter number"
          >
            <ArrowUpDown class="w-3 h-3" />
            Sort by Number
          </button>
          <button 
            @click="renumberChapters" 
            class="btn btn-sm btn-ghost gap-1"
            title="Renumber chapters sequentially (1, 2, 3...)"
          >
            <Hash class="w-3 h-3" />
            Renumber
          </button>
          <button 
            @click="fixAndRenumber" 
            class="btn btn-sm btn-primary gap-1"
            title="Sort chapters and renumber them"
          >
            <ArrowUpDown class="w-3 h-3" />
            Fix Order & Renumber
          </button>
        </div>
        <ChapterList />
      </div>

      <!-- TAB: TERMINOLOGY -->
      <div v-else-if="activeTab === 'terminology'">
        <TerminologyPanel />
      </div>
    </div>
  </div>
</template>
