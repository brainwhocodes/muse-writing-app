import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'

export interface StoryBeat {
  id: string
  text: string
  resolved: boolean
}

// Canonical Story Bible structure used across prompt builders and IPC persistence.
export interface StoryBible {
  coreThemes: string
  characterTerminologies: string
  toneGuidelines: string
  narrativeArc: string
  motifs: string
  worldRules: string
}

// Canonical Chapter contract: kept in sync with DB schema and IPC.
export interface StoryChapter {
  id: string
  title: string
  summary: string
  status: 'draft' | 'complete' | 'idea'
  placeholder?: string
  validatorNotes?: string
  draftStatus?: 'idea' | 'skeleton' | 'validated' | 'draft' | 'complete'
  denseSummary?: string
  contextSnapshot?: string
  contextTokens?: number
  lastPromptHash?: string
  content?: string // The actual chapter text
  characters?: string[] // Array of character IDs
  beats?: StoryBeat[] // Story beats to hit in this chapter
}

export interface Character {
  id: string
  name: string
  role: string
  bio: string
  traits: string
  isPov?: boolean
  voiceDiction?: string
  voiceForbidden?: string
  voiceMetaphors?: string
}

export interface BookMetadata {
  id?: string
  title: string
  author: string
  genre: string
  ageGroup: string
  logline: string
  synopsis: string
  originalPremise?: string // The prompt used to generate the outline
}

export interface StoryTerm {
  id: string
  term: string
  definition: string
  notes?: string
  chapters?: string[]
  category?: 'place' | 'object' | 'concept' | 'character' | 'event' | 'other'
  aliases?: string
}

export interface ProjectListItem {
  id: string
  title: string
  author: string
  updatedAt: Date | null
}

function sanitizeForClone<T>(value: T): T {
  const seen = new WeakSet<object>()
  const isWindowLike = (val: unknown): boolean => {
    if (typeof window === 'undefined') return false
    const win = val as Window | undefined
    return !!win && (win === window || win.window === win)
  }
  const visit = (input: unknown): unknown => {
    if (input === null) return null
    const type = typeof input
    if (type === 'string' || type === 'number' || type === 'boolean') return input
    if (type === 'undefined') return undefined
    if (type === 'bigint') return Number(input)
    if (type === 'function' || type === 'symbol') return undefined
    if (type !== 'object') return input
    if (isWindowLike(input) || (typeof document !== 'undefined' && input === document)) return undefined
    if (typeof Node !== 'undefined' && input instanceof Node) return undefined
    if (input instanceof Date) return new Date(input.getTime())
    if (input instanceof RegExp) return new RegExp(input)
    if (seen.has(input as object)) return undefined
    seen.add(input as object)
    if (Array.isArray(input)) {
      return input.map(visit).filter((item) => item !== undefined)
    }
    const output: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      const next = visit(val)
      if (next !== undefined) output[key] = next
    }
    return output
  }
  return visit(value) as T
}

function safeClone<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch (err) {
    console.warn('structuredClone failed, sanitizing value before save:', err)
    return sanitizeForClone(value)
  }
}

export const useProjectStore = defineStore('project', () => {
  const isSaving = ref(false)
  const lastSavedAt = ref<string | null>(null)
  const loadError = ref<string | null>(null)
  const projectList = ref<ProjectListItem[]>([])
  const currentProjectId = ref<string | null>(null)

  const storyBible = ref<StoryBible>({
    coreThemes: '',
    characterTerminologies: '',
    toneGuidelines: '',
    narrativeArc: '',
    motifs: '',
    worldRules: ''
  })

  const bookMetadata = ref<BookMetadata>({
    id: '',
    title: 'My New Novel',
    author: '',
    genre: '',
    ageGroup: '',
    logline: '',
    synopsis: ''
  })
  
  const storyOutline = ref<StoryChapter[]>([])
  const characterOutline = ref<Character[]>([])
  const terminology = ref<StoryTerm[]>([])

  async function listProjects(): Promise<ProjectListItem[]> {
    try {
      const projects = await window.ipcRenderer.invoke('db-list-projects')
      projectList.value = projects
      return projects
    } catch (err) {
      console.error('Failed to list projects:', err)
      return []
    }
  }

  async function deleteProject(projectId: string) {
    try {
      await window.ipcRenderer.invoke('db-delete-project', projectId)
      projectList.value = projectList.value.filter(p => p.id !== projectId)
      // If we deleted the current project, clear state
      if (currentProjectId.value === projectId) {
        currentProjectId.value = null
        newProject('Untitled Project')
      }
    } catch (err) {
      console.error('Failed to delete project:', err)
      throw err
    }
  }

  async function switchProject(projectId: string) {
    await loadProject(projectId)
  }

  async function saveProject() {
    isSaving.value = true
    loadError.value = null
    console.log('Saving project...')
    try {
      // Use structuredClone with toRaw to preserve types and avoid Vue reactivity issues
      const projectData = safeClone(toRaw({ ...bookMetadata.value, storyBible: storyBible.value }))
      const chaptersData = safeClone(toRaw(storyOutline.value))
      const charactersData = safeClone(toRaw(characterOutline.value))
      const termsData = safeClone(toRaw(terminology.value))
      await window.ipcRenderer.invoke('db-save-project', {
        project: projectData,
        chapters: chaptersData,
        characters: charactersData,
        terms: termsData
      })
      console.log('Project saved!')
      lastSavedAt.value = new Date().toISOString()
    } catch (err: unknown) {
      console.error('Failed to save project:', err)
      const message = err instanceof Error ? err.message : 'Save failed'
      alert(`Failed to save project: ${message}`)
      loadError.value = message
    } finally {
      isSaving.value = false
    }
  }

  async function loadProject(projectId?: string) {
    const idToLoad = projectId || currentProjectId.value || 'default-project'
    console.log('Loading project:', idToLoad)
    loadError.value = null
    try {
      const data = await window.ipcRenderer.invoke('db-load-project', idToLoad)
      if (data) {
        // Extract storyBible from project data and set separately (single source of truth)
        const { storyBible: loadedBible, ...metadataWithoutBible } = data.project || {}
        bookMetadata.value = {
          id: metadataWithoutBible.id || '',
          title: metadataWithoutBible.title || 'My New Novel',
          author: metadataWithoutBible.author || '',
          genre: metadataWithoutBible.genre || '',
          ageGroup: metadataWithoutBible.ageGroup || '',
          logline: metadataWithoutBible.logline || '',
          synopsis: metadataWithoutBible.synopsis || '',
          originalPremise: metadataWithoutBible.originalPremise || ''
        }
        storyBible.value = loadedBible || {
          coreThemes: '',
          characterTerminologies: '',
          toneGuidelines: '',
          narrativeArc: '',
          motifs: '',
          worldRules: ''
        }
        storyOutline.value = (data.chapters || []).map((c: StoryChapter) => ({
          placeholder: '',
          validatorNotes: '',
          draftStatus: c.status || 'draft',
          denseSummary: '',
          contextSnapshot: '',
          contextTokens: 0,
          lastPromptHash: '',
          ...c
        }))
        characterOutline.value = data.characters || []
        terminology.value = data.terms || []
        currentProjectId.value = data.project?.id || idToLoad
        lastSavedAt.value = new Date().toISOString()
      } else {
        newProject('Untitled Project')
      }
    } catch (err) {
      console.error('Failed to load project:', err)
      loadError.value = err instanceof Error ? err.message : 'Load failed'
    }
  }

  function addChapter(chapter: Omit<StoryChapter, 'id'>, atIndex?: number) {
    const newChapter: StoryChapter = { 
      ...chapter, 
      id: crypto.randomUUID(), 
      characters: chapter.characters || [],
      placeholder: chapter.placeholder || '',
      validatorNotes: chapter.validatorNotes || '',
      draftStatus: chapter.draftStatus || chapter.status || 'draft',
      denseSummary: chapter.denseSummary || '',
      contextSnapshot: chapter.contextSnapshot || '',
      contextTokens: chapter.contextTokens || 0,
      lastPromptHash: chapter.lastPromptHash || ''
    }
    if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= storyOutline.value.length) {
      storyOutline.value.splice(atIndex, 0, newChapter)
    } else {
      storyOutline.value.push(newChapter)
    }
  }

  function updateChapter(id: string, data: Partial<StoryChapter>) {
    const index = storyOutline.value.findIndex(c => c.id === id)
    if (index !== -1) {
      storyOutline.value[index] = { ...storyOutline.value[index], ...data }
    }
  }

  function moveChapter(id: string, direction: 'up' | 'down') {
    const index = storyOutline.value.findIndex(c => c.id === id)
    if (index === -1) return

    if (direction === 'up' && index > 0) {
      const temp = storyOutline.value[index]
      storyOutline.value[index] = storyOutline.value[index - 1]
      storyOutline.value[index - 1] = temp
    } else if (direction === 'down' && index < storyOutline.value.length - 1) {
      const temp = storyOutline.value[index]
      storyOutline.value[index] = storyOutline.value[index + 1]
      storyOutline.value[index + 1] = temp
    }
  }

  function deleteChapter(id: string) {
    const index = storyOutline.value.findIndex(c => c.id === id)
    if (index !== -1) {
      storyOutline.value.splice(index, 1)
    }
  }

  function addCharacter(character: Omit<Character, 'id'>) {
    characterOutline.value.push({ ...character, id: crypto.randomUUID() })
  }

  function updateCharacter(id: string, data: Partial<Character>) {
    const index = characterOutline.value.findIndex(c => c.id === id)
    if (index !== -1) {
      characterOutline.value[index] = { ...characterOutline.value[index], ...data }
    }
  }

  function deleteCharacter(id: string) {
    const index = characterOutline.value.findIndex(c => c.id === id)
    if (index !== -1) {
      characterOutline.value.splice(index, 1)
    }
  }

  function addTerm(term: Omit<StoryTerm, 'id'>) {
    terminology.value.push({ ...term, id: crypto.randomUUID(), chapters: term.chapters || [] })
  }

  function updateTerm(id: string, data: Partial<StoryTerm>) {
    const index = terminology.value.findIndex(t => t.id === id)
    if (index !== -1) {
      terminology.value[index] = { ...terminology.value[index], ...data }
    }
  }

  function deleteTerm(id: string) {
    const index = terminology.value.findIndex(t => t.id === id)
    if (index !== -1) {
      terminology.value.splice(index, 1)
    }
  }

  function updateStoryBible(data: Partial<StoryBible>) {
    storyBible.value = { ...storyBible.value, ...data }
  }

  function updateMetadata(data: Partial<BookMetadata>) {
    bookMetadata.value = { ...bookMetadata.value, ...data }
  }

  function newProject(name: string) {
    const newId = crypto.randomUUID()
    bookMetadata.value = {
      id: newId,
      title: name || 'Untitled Project',
      author: '',
      genre: '',
      ageGroup: '',
      logline: '',
      synopsis: ''
    }
    storyOutline.value = []
    characterOutline.value = []
    terminology.value = []
    storyBible.value = {
      coreThemes: '',
      characterTerminologies: '',
      toneGuidelines: '',
      narrativeArc: '',
      motifs: '',
      worldRules: ''
    }
    currentProjectId.value = newId
    lastSavedAt.value = null
  }

  return {
    isSaving,
    lastSavedAt,
    loadError,
    projectList,
    currentProjectId,
    bookMetadata,
    storyOutline,
    characterOutline,
    terminology,
    storyBible,
    updateMetadata,
    updateStoryBible,
    addChapter,
    updateChapter,
    moveChapter,
    deleteChapter,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    addTerm,
    updateTerm,
    deleteTerm,
    newProject,
    saveProject,
    loadProject,
    listProjects,
    deleteProject,
    switchProject
  }
})
