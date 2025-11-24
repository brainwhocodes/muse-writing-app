import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const openRouterKey = ref(localStorage.getItem('openRouterKey') || '')
  const selectedModel = ref(localStorage.getItem('selectedModel') || 'moonshotai/kimi-k2-thinking')
  const defaultPrompt = ref(localStorage.getItem('defaultPrompt') || 'Rewrite this paragraph to be more descriptive.')

  function setApiKey(key: string) {
    openRouterKey.value = key
    localStorage.setItem('openRouterKey', key)
  }

  function setModel(model: string) {
    selectedModel.value = model
    localStorage.setItem('selectedModel', model)
  }

  function setPrompt(prompt: string) {
    defaultPrompt.value = prompt
    localStorage.setItem('defaultPrompt', prompt)
  }

  return {
    openRouterKey,
    selectedModel,
    defaultPrompt,
    setApiKey,
    setModel,
    setPrompt
  }
})
