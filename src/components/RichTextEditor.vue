<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import { watch, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  minHeight?: string
  editable?: boolean
  class?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function isHtmlContent(value: string | undefined) {
  if (!value) return false
  return /<[a-z][\s\S]*>/i.test(value)
}

function getContentType(value: string | undefined) {
  if (!value) return 'html'
  return isHtmlContent(value) ? 'html' : 'markdown'
}

const editor = useEditor({
  content: '', // Start empty like EditorView
  editable: true, // Explicitly true
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: props.placeholder || 'Write something...',
    }),
    Markdown,
  ],
  editorProps: {
    attributes: {
      class: `prose prose-lg max-w-none focus:outline-none font-serif text-lg leading-relaxed px-4 py-3 ${props.class || ''}`,
    },
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
})

// Watch for editor to be ready, then set initial content
watch(editor, (editorInstance) => {
  if (editorInstance) {
    if (props.modelValue) {
      editorInstance.commands.setContent(props.modelValue, true, { contentType: getContentType(props.modelValue) })
    }
    editorInstance.setEditable(true)
  }
}, { immediate: true })

watch(() => props.modelValue, (newValue) => {
  if (editor.value && newValue !== editor.value.getHTML()) {
    editor.value.commands.setContent(newValue, true, { contentType: getContentType(newValue) })
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div 
    class="w-full border border-base-300 rounded-lg bg-base-100" 
    :style="{ minHeight: minHeight || '100px' }"
  >
    <EditorContent :editor="editor" />
    <div v-if="!editor" class="p-4 text-base-content/40 text-sm">Loading editor...</div>
  </div>
</template>

<style scoped>
:deep(.ProseMirror) {
  outline: none;
  min-height: inherit;
}
/* Tiptap Placeholder styling */
:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #adb5bd;
  pointer-events: none;
  height: 0;
}
</style>
