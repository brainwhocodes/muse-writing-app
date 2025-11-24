<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore } from '../stores/project'
import { Book, List } from 'lucide-vue-next'
import BookBible from '../components/BookBible.vue'
import ChapterList from '../components/ChapterList.vue'
import PipelineWizard from '../components/PipelineWizard.vue'

const projectStore = useProjectStore()
const activeTab = ref<'overview' | 'chapters'>('overview')
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
        </div>
      </div>
      <div class="flex-none">
        <PipelineWizard />
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
        <ChapterList />
      </div>
    </div>
  </div>
</template>
