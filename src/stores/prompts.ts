import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AI_PROMPTS } from '../constants/prompts'

/**
 * Stored prompt with metadata
 */
interface StoredPrompt {
  id: string
  name: string
  basePromptKey: keyof typeof AI_PROMPTS
  originalPrompt: string
  improvedPrompt: string
  score: number
  mutations: string[]
  createdAt: string
  updatedAt: string
}

/**
 * Store for managing improved prompts via GEPA optimization
 * Persists to SQLite database via Electron IPC
 */
export const usePromptStore = defineStore('prompts', () => {
  const improvedPrompts = ref<StoredPrompt[]>([])
  const isLoaded = ref(false)
  const isLoading = ref(false)

  /**
   * Get the effective prompt for a given key
   * Returns improved version if available, otherwise original
   */
  function getPrompt(key: keyof typeof AI_PROMPTS): string {
    const improved = improvedPrompts.value.find(p => p.basePromptKey === key)
    if (improved) {
      return improved.improvedPrompt
    }
    return AI_PROMPTS[key]
  }

  /**
   * Check if a prompt has been improved
   */
  function hasImprovedPrompt(key: keyof typeof AI_PROMPTS): boolean {
    return improvedPrompts.value.some(p => p.basePromptKey === key)
  }

  /**
   * Get metadata for an improved prompt
   */
  function getPromptMetadata(key: keyof typeof AI_PROMPTS): StoredPrompt | undefined {
    return improvedPrompts.value.find(p => p.basePromptKey === key)
  }

  /**
   * Save an improved prompt to database
   */
  async function saveImprovedPrompt(data: {
    name: string
    basePromptKey: keyof typeof AI_PROMPTS
    originalPrompt: string
    improvedPrompt: string
    score: number
    mutations: string[]
  }): Promise<void> {
    const existing = improvedPrompts.value.findIndex(p => p.basePromptKey === data.basePromptKey)
    const now = new Date().toISOString()
    const id = existing >= 0 ? improvedPrompts.value[existing].id : crypto.randomUUID()

    const promptData: StoredPrompt = {
      id,
      name: data.name,
      basePromptKey: data.basePromptKey,
      originalPrompt: data.originalPrompt,
      improvedPrompt: data.improvedPrompt,
      score: data.score,
      mutations: data.mutations,
      createdAt: existing >= 0 ? improvedPrompts.value[existing].createdAt : now,
      updatedAt: now
    }

    // Update local state
    if (existing >= 0) {
      improvedPrompts.value[existing] = promptData
    } else {
      improvedPrompts.value.push(promptData)
    }

    // Persist to database
    try {
      await window.ipcRenderer.invoke('db-save-improved-prompt', {
        id: promptData.id,
        name: promptData.name,
        basePromptKey: promptData.basePromptKey,
        originalPrompt: promptData.originalPrompt,
        improvedPrompt: promptData.improvedPrompt,
        score: promptData.score,
        mutations: promptData.mutations
      })
    } catch (e) {
      console.error('Failed to save improved prompt to database:', e)
    }
  }

  /**
   * Reset a prompt to its original version
   */
  async function resetPrompt(key: keyof typeof AI_PROMPTS): Promise<void> {
    const index = improvedPrompts.value.findIndex(p => p.basePromptKey === key)
    if (index >= 0) {
      improvedPrompts.value.splice(index, 1)
      
      // Remove from database
      try {
        await window.ipcRenderer.invoke('db-delete-improved-prompt', key)
      } catch (e) {
        console.error('Failed to delete improved prompt from database:', e)
      }
    }
  }

  /**
   * Load prompts from database
   */
  async function loadPrompts(): Promise<void> {
    if (isLoaded.value || isLoading.value) return
    isLoading.value = true
    
    try {
      const prompts = await window.ipcRenderer.invoke('db-load-improved-prompts')
      if (prompts && Array.isArray(prompts)) {
        improvedPrompts.value = prompts as StoredPrompt[]
      }
      isLoaded.value = true
    } catch (e) {
      console.error('Failed to load improved prompts from database:', e)
      isLoaded.value = true
    } finally {
      isLoading.value = false
    }
  }

  /**
   * List of available prompts that can be optimized
   */
  const optimizablePrompts = computed(() => [
    { key: 'CHAPTER_WRITER' as const, name: 'Chapter Writer', description: 'Generates full chapter text' },
    { key: 'STORY_ARCHITECT' as const, name: 'Story Architect', description: 'Creates story outlines with characters and terms' },
    { key: 'OUTLINE_GENERATOR' as const, name: 'Outline Generator', description: 'Creates chapter outlines only' },
    { key: 'CONTINUITY_CHECK' as const, name: 'Continuity Check', description: 'Reviews chapter continuity' },
    { key: 'TRANSITION_GENERATOR' as const, name: 'Transition Generator', description: 'Smooths chapter transitions' },
    { key: 'BEATS_GENERATOR' as const, name: 'Beats Generator', description: 'Creates story beats' },
    { key: 'GEPA_CHAPTER_REFLECT' as const, name: 'Chapter Reflection', description: 'GEPA: Analyzes chapter drafts' },
    { key: 'GEPA_CHAPTER_IMPROVE' as const, name: 'Chapter Improvement', description: 'GEPA: Improves chapters based on feedback' },
    { key: 'GEPA_CONTINUITY_REFLECT' as const, name: 'Continuity Reflection', description: 'GEPA: Analyzes continuity issues' },
    { key: 'GEPA_CONTINUITY_IMPROVE' as const, name: 'Continuity Improvement', description: 'GEPA: Fixes continuity issues' },
    { key: 'GEPA_BEATS_REFLECT' as const, name: 'Beats Reflection', description: 'GEPA: Analyzes story beats' },
    { key: 'GEPA_BEATS_IMPROVE' as const, name: 'Beats Improvement', description: 'GEPA: Improves story beats' }
  ])

  // Auto-load on store creation
  loadPrompts()

  return {
    improvedPrompts,
    isLoaded,
    isLoading,
    getPrompt,
    hasImprovedPrompt,
    getPromptMetadata,
    saveImprovedPrompt,
    resetPrompt,
    loadPrompts,
    optimizablePrompts
  }
})

export type { StoredPrompt }
