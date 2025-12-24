<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore, type Character } from '../stores/project'
import { Plus, Wand2, Sparkles, FileSearch } from 'lucide-vue-next'
import CharacterCard from '../components/CharacterCard.vue'
import CharacterEditor from '../components/CharacterEditor.vue'
import { generateText } from '../services/ai'
import { useChapterContext } from '../composables/useChapterContext'

const projectStore = useProjectStore()
const { extractFromChapter, buildCharacterContext } = useChapterContext()

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------
const showEditor = ref(false)
const editingId = ref<string | null>(null)
const editForm = ref<Partial<Character>>({})
const isGenerating = ref(false)
const generateStatus = ref('')

// ------------------------------------------------------------------
// Actions
// ------------------------------------------------------------------

function startAdd() {
  editingId.value = 'NEW'
  editForm.value = { name: '', role: '', bio: '', traits: '' }
  showEditor.value = true
}

function startEdit(character: Character) {
  editingId.value = character.id
  editForm.value = { ...character }
  showEditor.value = true
}

function deleteCharacter(id: string) {
  if (confirm('Are you sure you want to delete this character?')) {
    projectStore.deleteCharacter(id)
  }
}

function cancelEdit() {
  showEditor.value = false
  editingId.value = null
  editForm.value = {}
}

function saveCharacter() {
  if (!editForm.value.name) return // Basic validation

  if (editingId.value === 'NEW') {
    projectStore.addCharacter({
      name: editForm.value.name,
      role: editForm.value.role || 'Supporting',
      bio: editForm.value.bio || '',
      traits: editForm.value.traits || ''
    })
  } else if (editingId.value) {
    projectStore.updateCharacter(editingId.value, editForm.value)
  }
  
  cancelEdit()
}

/**
 * Generate characters from story context
 */
async function generateCharacters() {
  if (!projectStore.bookMetadata.synopsis && projectStore.storyOutline.length === 0) {
    alert('Add a synopsis or chapter outlines first to generate characters.')
    return
  }
  isGenerating.value = true
  generateStatus.value = 'Generating characters...'
  try {
    const context = buildCharacterContext()
    const existingNames = projectStore.characterOutline.map(c => c.name.toLowerCase())
    const prompt = `${context}

Generate 2-4 NEW characters for this story. These characters should:
- Fit naturally into the existing chapters and plot
- Have distinct roles that complement existing characters
- NOT duplicate any existing characters listed above

OUTPUT FORMAT (JSON array only):
[{"name": "Full Name", "role": "Protagonist|Antagonist|Mentor|Ally|Supporting|Minor", "bio": "2-3 sentences about their background and motivation", "traits": "3-5 comma-separated personality traits"}]

Output ONLY the JSON array.`
    const result = await generateText(prompt, '', 'outline')
    const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const match = cleaned.match(/\[[\s\S]*\]/s)
    if (!match) throw new Error('Could not parse characters')
    const newChars: Array<{ name: string; role: string; bio: string; traits: string }> = JSON.parse(match[0])
    const filtered = newChars.filter(c => !existingNames.includes(c.name.toLowerCase()))
    if (filtered.length === 0) {
      generateStatus.value = 'No new unique characters generated.'
      setTimeout(() => { generateStatus.value = '' }, 3000)
      return
    }
    filtered.forEach(c => {
      projectStore.addCharacter({
        name: c.name,
        role: c.role || 'Supporting',
        bio: c.bio || '',
        traits: c.traits || ''
      })
    })
    generateStatus.value = `Added ${filtered.length} new characters!`
    setTimeout(() => { generateStatus.value = '' }, 3000)
  } catch (err) {
    console.error('Character generation failed:', err)
    generateStatus.value = 'Generation failed'
    setTimeout(() => { generateStatus.value = '' }, 3000)
  } finally {
    isGenerating.value = false
  }
}

/**
 * Extract character mentions from written chapters
 */
async function extractCharactersFromChapters() {
  const chaptersWithContent = projectStore.storyOutline.filter(c => c.content && c.content.length > 100)
  if (chaptersWithContent.length === 0) {
    alert('No chapters with content to extract from.')
    return
  }
  isGenerating.value = true
  generateStatus.value = 'Scanning chapters for characters...'
  try {
    const allMentions: Array<{ name: string; context: string }> = []
    for (let i = 0; i < Math.min(chaptersWithContent.length, 5); i++) {
      const chapter = chaptersWithContent[i]
      generateStatus.value = `Scanning ${chapter.title}...`
      const result = await extractFromChapter(chapter.id)
      allMentions.push(...result.characterMentions)
    }
    const existingNames = new Set(projectStore.characterOutline.map(c => c.name.toLowerCase()))
    const uniqueMentions = allMentions.filter(m => !existingNames.has(m.name.toLowerCase()))
    const deduped = uniqueMentions.reduce((acc, m) => {
      if (!acc.find(x => x.name.toLowerCase() === m.name.toLowerCase())) {
        acc.push(m)
      }
      return acc
    }, [] as typeof uniqueMentions)
    if (deduped.length === 0) {
      generateStatus.value = 'No new characters found in chapters.'
      setTimeout(() => { generateStatus.value = '' }, 3000)
      return
    }
    deduped.forEach(m => {
      projectStore.addCharacter({
        name: m.name,
        role: 'Minor',
        bio: m.context || 'Extracted from chapter content',
        traits: ''
      })
    })
    generateStatus.value = `Found ${deduped.length} new character mentions!`
    setTimeout(() => { generateStatus.value = '' }, 3000)
  } catch (err) {
    console.error('Character extraction failed:', err)
    generateStatus.value = 'Extraction failed'
    setTimeout(() => { generateStatus.value = '' }, 3000)
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-base-200/30 relative">
    
    <!-- Header -->
    <div class="navbar bg-base-100 border-b border-base-300 px-6 min-h-16 sticky top-0 z-10">
      <div class="flex-1">
        <h1 class="text-xl font-bold">Characters</h1>
      </div>
      <div class="flex-none flex gap-2">
        <!-- AI Tools Dropdown -->
        <div class="dropdown dropdown-end">
          <button tabindex="0" class="btn btn-ghost btn-sm gap-2" :disabled="isGenerating">
            <Wand2 class="w-4 h-4" />
            <span v-if="isGenerating" class="loading loading-spinner loading-xs"></span>
            <span v-else>AI Tools</span>
          </button>
          <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-50 w-64 p-2 shadow-xl border border-base-200">
            <li>
              <button @click="generateCharacters()" :disabled="isGenerating" class="flex gap-3">
                <Sparkles class="w-4 h-4 text-primary" />
                <div class="text-left">
                  <div class="font-medium">Generate New</div>
                  <div class="text-xs opacity-60">Create characters from story context</div>
                </div>
              </button>
            </li>
            <li v-if="projectStore.storyOutline.some(c => c.content)">
              <button @click="extractCharactersFromChapters()" :disabled="isGenerating" class="flex gap-3">
                <FileSearch class="w-4 h-4 text-accent" />
                <div class="text-left">
                  <div class="font-medium">Extract from Chapters</div>
                  <div class="text-xs opacity-60">Find characters in written content</div>
                </div>
              </button>
            </li>
          </ul>
        </div>
        <button @click="startAdd" class="btn btn-primary btn-sm shadow-md">
          <Plus class="w-4 h-4 mr-2" />
          Add Character
        </button>
      </div>
    </div>

    <!-- Status Banner -->
    <div v-if="generateStatus" class="alert alert-info mx-6 mt-4 shadow-lg">
      <span class="loading loading-spinner loading-sm" v-if="isGenerating"></span>
      <span>{{ generateStatus }}</span>
    </div>

    <!-- Character Grid -->
    <div class="flex-1 overflow-y-auto p-6">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto pb-20">
        
        <CharacterCard 
          v-for="char in projectStore.characterOutline" 
          :key="char.id" 
          :character="char"
          @edit="startEdit"
          @delete="deleteCharacter"
        />

        <!-- Empty State -->
        <div 
          v-if="projectStore.characterOutline.length === 0"
          class="col-span-full flex flex-col items-center justify-center h-96 text-base-content/40 border-2 border-dashed border-base-300 rounded-xl bg-base-100/50"
        >
          <div class="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center mb-4">
             <Plus class="w-8 h-8 opacity-20" />
          </div>
          <p class="text-lg font-medium">No characters yet</p>
          <p class="text-sm opacity-60 mb-6">Start building your cast by adding a character.</p>
          <button @click="startAdd" class="btn btn-primary btn-sm">Create Character</button>
        </div>

      </div>
    </div>

    <!-- Editor Modal / Overlay -->
    <div v-if="showEditor" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <CharacterEditor 
        v-model="editForm" 
        :is-new="editingId === 'NEW'"
        @save="saveCharacter" 
        @cancel="cancelEdit" 
      />
    </div>

  </div>
</template>
