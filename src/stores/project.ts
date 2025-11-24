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

export const useProjectStore = defineStore('project', () => {
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

  async function saveProject() {
    console.log('Saving project...')
    try {
      await window.ipcRenderer.invoke('db-save-project', {
        project: JSON.parse(JSON.stringify(bookMetadata.value)),
        chapters: JSON.parse(JSON.stringify(storyOutline.value)),
        characters: JSON.parse(JSON.stringify(characterOutline.value))
      })
      console.log('Project saved!')
    } catch (err: any) {
      console.error('Failed to save project:', err)
      // Show alert for debugging
      alert(`Failed to save project: ${err.message || err}`)
    }
  }

  async function loadProject() {
    console.log('Loading project...')
    try {
      const data = await window.ipcRenderer.invoke('db-load-project')
      if (data) {
        bookMetadata.value = data.project
        storyOutline.value = data.chapters
        characterOutline.value = data.characters
      }
    } catch (err) {
      console.error('Failed to load project:', err)
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

  function updateMetadata(data: Partial<BookMetadata>) {
    bookMetadata.value = { ...bookMetadata.value, ...data }
  }

  return {
    bookMetadata,
    storyOutline,
    characterOutline,
    updateMetadata,
    addChapter,
    updateChapter,
    moveChapter,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    saveProject,
    loadProject
  }
})
