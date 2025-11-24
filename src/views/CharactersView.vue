<script setup lang="ts">
import { ref } from 'vue'
import { useProjectStore, type Character } from '../stores/project'
import { Plus } from 'lucide-vue-next'
import CharacterCard from '../components/CharacterCard.vue'
import CharacterEditor from '../components/CharacterEditor.vue'

const projectStore = useProjectStore()

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------
const showEditor = ref(false)
const editingId = ref<string | null>(null)
const editForm = ref<Partial<Character>>({})

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
</script>

<template>
  <div class="h-full flex flex-col bg-base-200/30 relative">
    
    <!-- Header -->
    <div class="navbar bg-base-100 border-b border-base-300 px-6 min-h-16 sticky top-0 z-10">
      <div class="flex-1">
        <h1 class="text-xl font-bold">Characters</h1>
      </div>
      <div class="flex-none">
        <button @click="startAdd" class="btn btn-primary btn-sm shadow-md">
          <Plus class="w-4 h-4 mr-2" />
          Add Character
        </button>
      </div>
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
