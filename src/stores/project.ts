import { defineStore } from 'pinia'
import { ref } from 'vue'

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
  logline: string
  synopsis: string
  originalPremise?: string // The prompt used to generate the outline
  storyBible?: StoryBible
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
    logline: '',
    synopsis: '',
    storyBible: {
      coreThemes: '',
      characterTerminologies: '',
      toneGuidelines: '',
      narrativeArc: '',
      motifs: '',
      worldRules: ''
    }
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
      await window.ipcRenderer.invoke('db-save-project', {
        project: JSON.parse(JSON.stringify({ ...bookMetadata.value, storyBible: storyBible.value })),
        chapters: JSON.parse(JSON.stringify(storyOutline.value)),
        characters: JSON.parse(JSON.stringify(characterOutline.value)),
        terms: JSON.parse(JSON.stringify(terminology.value))
      })
      console.log('Project saved!')
      lastSavedAt.value = new Date().toISOString()
    } catch (err: any) {
      console.error('Failed to save project:', err)
      // Show alert for debugging
      alert(`Failed to save project: ${err.message || err}`)
      loadError.value = err?.message || 'Save failed'
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
        bookMetadata.value = data.project
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
        characterOutline.value = data.characters
        terminology.value = data.terms || []
        storyBible.value = data.project?.storyBible || {
          coreThemes: '',
          characterTerminologies: '',
          toneGuidelines: '',
          narrativeArc: '',
          motifs: '',
          worldRules: ''
        }
        currentProjectId.value = data.project.id
        lastSavedAt.value = new Date().toISOString()
      } else {
        // No project found, create a new one
        newProject('Untitled Project')
      }
    } catch (err) {
      console.error('Failed to load project:', err)
      loadError.value = (err as any)?.message || 'Load failed'
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
