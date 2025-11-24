import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useEditorStore = defineStore('editor', () => {
  const content = ref('')
  const isGenerating = ref(false)
  
  // For Diff/Review feature
  const originalContent = ref('')
  const suggestedContent = ref('')
  const showDiff = ref(false)

  function setContent(newContent: string) {
    content.value = newContent
  }

  function startGeneration() {
    isGenerating.value = true
  }

  function finishGeneration(result: string, original: string) {
    isGenerating.value = false
    originalContent.value = original
    suggestedContent.value = result
    showDiff.value = true
  }

  function acceptDiff() {
    // Apply the suggested content
    // Logic might need to be more complex depending on if we replace whole doc or just selection
    // For now, assuming block replacement or simple swap handled by editor component
    showDiff.value = false
    suggestedContent.value = ''
    originalContent.value = ''
  }

  function rejectDiff() {
    showDiff.value = false
    suggestedContent.value = ''
    originalContent.value = ''
  }

  return {
    content,
    isGenerating,
    originalContent,
    suggestedContent,
    showDiff,
    setContent,
    startGeneration,
    finishGeneration,
    acceptDiff,
    rejectDiff
  }
})
