import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface StoryChapter {
  id: string
  title: string
  summary: string
  status: 'draft' | 'complete' | 'idea'
  content?: string // The actual chapter text
  characters?: string[] // Array of character IDs
}

export interface Character {
  id: string
  name: string
  role: string
  bio: string
  traits: string
}

export interface BookMetadata {
  id?: string
  title: string
  author: string
  genre: string
  logline: string
  synopsis: string
}

export interface StoryTerm {
  id: string
  term: string
  definition: string
  notes?: string
  chapters?: string[]
}

export const useProjectStore = defineStore('project', () => {
  const isSaving = ref(false)
  const lastSavedAt = ref<string | null>(null)
  const loadError = ref<string | null>(null)

  const bookMetadata = ref<BookMetadata>({
    id: 'default-project',
    title: 'My New Novel',
    author: '',
    genre: '',
    logline: '',
    synopsis: ''
  })
  // Initialize with some dummy data for now
  const storyOutline = ref<StoryChapter[]>([
    { id: '1', title: 'Chapter 1: The Beginning', summary: 'Hero wakes up in a strange world.', status: 'draft' }
  ])
  
  const characterOutline = ref<Character[]>([
    { id: '1', name: 'Alice', role: 'Protagonist', bio: 'A curious explorer.', traits: 'Brave, reckless' }
  ])

  const terminology = ref<StoryTerm[]>([
    { id: 't1', term: 'The Shimmer', definition: 'A mysterious veil between worlds that fuels the plot.', chapters: ['1'] }
  ])

  async function saveProject() {
    isSaving.value = true
    loadError.value = null
    console.log('Saving project...')
    try {
      await window.ipcRenderer.invoke('db-save-project', {
        project: JSON.parse(JSON.stringify(bookMetadata.value)),
        chapters: JSON.parse(JSON.stringify(storyOutline.value)),
        characters: JSON.parse(JSON.stringify(characterOutline.value)),
        terms: JSON.parse(JSON.stringify(terminology.value)),
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

  async function loadProject() {
    console.log('Loading project...')
    loadError.value = null
    try {
      const data = await window.ipcRenderer.invoke('db-load-project')
      if (data) {
        bookMetadata.value = data.project
        storyOutline.value = data.chapters
        characterOutline.value = data.characters
        terminology.value = data.terms || []
      }
    } catch (err) {
      console.error('Failed to load project:', err)
      loadError.value = (err as any)?.message || 'Load failed'
    }
  }

  function addChapter(chapter: Omit<StoryChapter, 'id'>) {
    storyOutline.value.push({ ...chapter, id: crypto.randomUUID(), characters: chapter.characters || [] })
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

  function updateMetadata(data: Partial<BookMetadata>) {
    bookMetadata.value = { ...bookMetadata.value, ...data }
  }

  function newProject(name: string) {
    bookMetadata.value = {
      id: crypto.randomUUID(),
      title: name || 'Untitled Project',
      author: '',
      genre: '',
      logline: '',
      synopsis: ''
    }
    storyOutline.value = []
    characterOutline.value = []
    terminology.value = []
    lastSavedAt.value = null
  }

  return {
    isSaving,
    lastSavedAt,
    loadError,
    bookMetadata,
    storyOutline,
    characterOutline,
    terminology,
    updateMetadata,
    addChapter,
    updateChapter,
    moveChapter,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    addTerm,
    updateTerm,
    deleteTerm,
    newProject,
    saveProject,
    loadProject
  }
})
