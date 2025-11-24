<script setup lang="ts">
import { type Character } from '../stores/project'
import { Trash2, Edit2 } from 'lucide-vue-next'

const props = defineProps<{
  character: Character
}>()

const emit = defineEmits<{
  (e: 'edit', character: Character): void
  (e: 'delete', id: string): void
}>()

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

// Helper to split traits string into array
function getTraitsList(traits: string) {
  if (!traits) return []
  return traits.split(',').map(t => t.trim()).filter(t => t)
}
</script>

<template>
  <div class="card bg-base-100 shadow-md hover:shadow-xl transition-all duration-300 border border-base-200 group overflow-hidden">
    
    <!-- Decorative Top Bar -->
    <div class="h-2 bg-linear-to-r from-secondary/40 to-primary/40"></div>

    <div class="card-body p-6 relative">
      
      <!-- Avatar & Role -->
      <div class="flex items-start justify-between mb-4">
        <div class="avatar ring ring-base-200 ring-offset-2 rounded-full bg-base-100">
          <div class="w-16 h-16 rounded-full overflow-hidden">
            <img src="../assets/character-avatar.svg" alt="Character Avatar" class="w-full h-full object-cover" />
          </div>
        </div>
        <div class="badge badge-outline font-bold uppercase tracking-wider text-[10px] opacity-70">
          {{ character.role || 'Unknown Role' }}
        </div>
      </div>

      <!-- Identity -->
      <div>
        <h2 class="card-title text-2xl font-serif font-bold mb-1 group-hover:text-primary transition-colors cursor-pointer" @click="$emit('edit', character)">
          {{ character.name }}
        </h2>
      </div>

      <!-- Traits (Pills) -->
      <div class="flex flex-wrap gap-1.5 my-3 min-h-[2rem]">
        <span 
          v-for="(trait, i) in getTraitsList(character.traits).slice(0, 3)" 
          :key="i"
          class="badge badge-sm badge-ghost bg-base-200/50 text-xs"
        >
          {{ trait }}
        </span>
        <span v-if="getTraitsList(character.traits).length > 3" class="badge badge-sm badge-ghost text-xs opacity-50">
          +{{ getTraitsList(character.traits).length - 3 }}
        </span>
      </div>

      <!-- Bio Preview -->
      <p class="text-sm text-base-content/70 line-clamp-3 mb-4 leading-relaxed h-[4.5rem]">
        {{ character.bio || 'No bio available.' }}
      </p>

      <!-- Hover Actions Overlay -->
      <div class="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 transform translate-y-2 group-hover:translate-y-0 bg-base-100/80 backdrop-blur-sm p-1 rounded-lg">
        <button @click="$emit('edit', character)" class="btn btn-sm btn-ghost btn-square text-primary hover:bg-primary/10" title="Edit">
          <Edit2 class="w-4 h-4" />
        </button>
        <button @click="$emit('delete', character.id)" class="btn btn-sm btn-ghost btn-square text-error hover:bg-error/10" title="Delete">
          <Trash2 class="w-4 h-4" />
        </button>
      </div>

    </div>
  </div>
</template>
