<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import StarterKit from '@tiptap/starter-kit'
import BubbleMenuExtension from '@tiptap/extension-bubble-menu'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from '@tiptap/markdown'
import { Wand2, Check, X, Bold, Italic, ChevronDown, FileText, PanelRightOpen, PanelRightClose, UserCircle2, History, Users, BookOpen, Mic, AlertTriangle, Quote, Pilcrow, GitCompare, ArrowLeftRight } from 'lucide-vue-next'
import { useEditorStore } from '../stores/editor'
import { useProjectStore } from '../stores/project'
import { usePromptStore } from '../stores/prompts'
import { generateText, streamText } from '../services/ai'
import { marked } from 'marked'
import DiffViewer from '../components/DiffViewer.vue'
import ContinuityCheckModal from '../components/ContinuityCheckModal.vue'
import TransitionModal from '../components/TransitionModal.vue'
import BeatsPanel from '../components/BeatsPanel.vue'
import { stripHtml, isHtml, getContentType, cleanMixedContent, getHtmlBlocks } from '../composables/useTextUtils'
import { useChapterContext } from '../composables/useChapterContext'

const editorStore = useEditorStore()
const projectStore = useProjectStore()
const promptStore = usePromptStore()
const { buildChapterPrompt, buildEditSystemPrompt, buildContinuityPrompt } = useChapterContext()

const currentChapterId = ref<string | null>(null)
const showSidebar = ref(true)
const pageCount = ref(1)
const editorContainer = ref<HTMLElement | null>(null)

// Page dimensions (11 inches at 96 DPI)
const PAGE_HEIGHT_PIXELS = 11 * 96 // 1056px total height per page

// Computed property for the current chapter
const currentChapter = computed(() => {
  return projectStore.storyOutline.find(c => c.id === currentChapterId.value) || null
})

// Calculate pages based on content height
function updatePageCount() {
  if (!editorContainer.value) return
  
  // Use setTimeout to ensure DOM has updated
  setTimeout(() => {
    if (!editorContainer.value) return
    // Use full scrollHeight (including padding) to calculate pages
    const contentHeight = editorContainer.value.scrollHeight
    const rectHeight = editorContainer.value.getBoundingClientRect().height
    const finalHeight = Math.max(contentHeight, rectHeight)
    
    const calculatedPages = Math.max(1, Math.ceil(finalHeight / PAGE_HEIGHT_PIXELS))
    console.log('Page count update:', { contentHeight, rectHeight, calculatedPages, PAGE_HEIGHT_PIXELS })
    pageCount.value = calculatedPages
  }, 100)
}

// Computed characters in this chapter
const chapterCharacters = computed(() => {
  if (!currentChapter.value || !currentChapter.value.characters) return []
  return projectStore.characterOutline.filter(c => currentChapter.value!.characters?.includes(c.id))
})

// POV characters in this chapter (for voice board)
const povCharacters = computed(() => {
  return chapterCharacters.value.filter(c => c.isPov)
})

// Beats management
const isGeneratingBeats = ref(false)
const useGEPABeats = ref(true)
const gepaBeatStage = ref<'generate' | 'reflect' | 'improve' | null>(null)

const chapterBeats = computed(() => {
  return currentChapter.value?.beats || []
})

function addBeatFromPanel(text: string) {
  if (!text.trim() || !currentChapterId.value) return
  const beat = { id: crypto.randomUUID(), text: text.trim(), resolved: false }
  const beats = [...(currentChapter.value?.beats || []), beat]
  projectStore.updateChapter(currentChapterId.value, { beats })
}

function toggleBeat(beatId: string) {
  if (!currentChapterId.value) return
  const beats = (currentChapter.value?.beats || []).map(b => 
    b.id === beatId ? { ...b, resolved: !b.resolved } : b
  )
  projectStore.updateChapter(currentChapterId.value, { beats })
}

function removeBeat(beatId: string) {
  if (!currentChapterId.value) return
  const beats = (currentChapter.value?.beats || []).filter(b => b.id !== beatId)
  projectStore.updateChapter(currentChapterId.value, { beats })
}

function cleanBeatsJson(text: string): string {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
}

async function generateBeats() {
  if (!currentChapter.value || !currentChapterId.value) return
  const synopsis = currentChapter.value.summary
  if (!synopsis || synopsis.trim().length === 0) {
    alert('Add a chapter synopsis first to generate beats.')
    return
  }

  isGeneratingBeats.value = true
  gepaBeatStage.value = null

  try {
    const prompt = `Chapter: ${currentChapter.value.title}\n\nSynopsis:\n${synopsis}`
    let beatTexts: string[]

    if (useGEPABeats.value) {
      // GEPA Stage 1: Generate initial beats
      gepaBeatStage.value = 'generate'
      const initialRaw = await generateText(prompt, '', 'outline', promptStore.getPrompt('BEATS_GENERATOR'))
      const initialCleaned = cleanBeatsJson(initialRaw)
      let initialBeats: string[]
      try {
        const match = initialCleaned.match(/\[[\s\S]*\]/s)
        initialBeats = match ? JSON.parse(match[0]) : []
      } catch {
        initialBeats = []
      }

      if (initialBeats.length === 0) {
        throw new Error('Failed to generate initial beats')
      }

      // GEPA Stage 2: Reflect on beats
      gepaBeatStage.value = 'reflect'
      const reflectPrompt = `SYNOPSIS:\n${synopsis}\n\nPROPOSED BEATS:\n${initialBeats.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
      const reflectionRaw = await generateText(reflectPrompt, '', 'outline', promptStore.getPrompt('GEPA_BEATS_REFLECT'))
      
      type BeatsReflection = { missing: string[]; vague: string[]; improvements: string[]; priority: string }
      let reflection: BeatsReflection
      try {
        const cleaned = cleanBeatsJson(reflectionRaw)
        const match = cleaned.match(/\{[\s\S]*\}/s)
        reflection = match ? JSON.parse(match[0]) : { missing: [], vague: [], improvements: [], priority: '' }
      } catch {
        reflection = { missing: [], vague: [], improvements: [], priority: '' }
      }

      // GEPA Stage 3: Improve beats
      gepaBeatStage.value = 'improve'
      const improvePrompt = `SYNOPSIS:\n${synopsis}\n\nCURRENT BEATS:\n${initialBeats.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\nFEEDBACK:\n- Missing: ${reflection.missing.join('; ') || 'None'}\n- Vague: ${reflection.vague.join('; ') || 'None'}\n- Suggestions: ${reflection.improvements.join('; ') || 'None'}\n- Priority: ${reflection.priority || 'Polish'}`
      
      const improvedRaw = await generateText(improvePrompt, '', 'outline', promptStore.getPrompt('GEPA_BEATS_IMPROVE'))
      const improvedCleaned = cleanBeatsJson(improvedRaw)
      try {
        const match = improvedCleaned.match(/\[[\s\S]*\]/s)
        beatTexts = match ? JSON.parse(match[0]) : initialBeats
      } catch {
        beatTexts = initialBeats // Fall back to initial if improvement fails
      }
    } else {
      // Standard single-pass
      gepaBeatStage.value = 'generate'
      const raw = await generateText(prompt, '', 'outline', promptStore.getPrompt('BEATS_GENERATOR'))
      const cleaned = cleanBeatsJson(raw)
      try {
        const match = cleaned.match(/\[[\s\S]*\]/s)
        beatTexts = match ? JSON.parse(match[0]) : []
      } catch {
        beatTexts = []
      }
    }

    // Convert to beat objects and save
    if (beatTexts.length > 0) {
      const newBeats = beatTexts.map(text => ({
        id: crypto.randomUUID(),
        text: String(text),
        resolved: false
      }))
      projectStore.updateChapter(currentChapterId.value, { beats: newBeats })
    }
  } catch (e) {
    console.error('Beat generation failed:', e)
    alert('Failed to generate beats. Try again.')
  } finally {
    isGeneratingBeats.value = false
    gepaBeatStage.value = null
  }
}

// Recent Canon - track last mentions of entities
interface CanonMention {
  entity: string
  type: 'character' | 'term' | 'location'
  lastChapterIndex: number
  lastChapterTitle: string
  excerpt: string
}

const recentCanon = computed((): CanonMention[] => {
  if (!currentChapterId.value) return []
  const currentIndex = projectStore.storyOutline.findIndex(c => c.id === currentChapterId.value)
  if (currentIndex <= 0) return []
  const mentions: CanonMention[] = []
  const currentContent = stripHtml(currentChapter.value?.content || '')
  const findLastMention = (searchTerm: string, type: 'character' | 'term' | 'location'): CanonMention | null => {
    const termLower = searchTerm.toLowerCase()
    if (!currentContent.toLowerCase().includes(termLower)) return null
    for (let i = currentIndex - 1; i >= 0; i--) {
      const chapter = projectStore.storyOutline[i]
      const chapterText = stripHtml(chapter.content || chapter.summary || '')
      const lowerText = chapterText.toLowerCase()
      const pos = lowerText.lastIndexOf(termLower)
      if (pos !== -1) {
        const start = Math.max(0, pos - 40)
        const end = Math.min(chapterText.length, pos + searchTerm.length + 40)
        let excerpt = chapterText.substring(start, end).trim()
        if (start > 0) excerpt = '...' + excerpt
        if (end < chapterText.length) excerpt = excerpt + '...'
        return {
          entity: searchTerm,
          type,
          lastChapterIndex: i + 1,
          lastChapterTitle: chapter.title,
          excerpt
        }
      }
    }
    return null
  }
  projectStore.characterOutline.forEach(char => {
    const mention = findLastMention(char.name, 'character')
    if (mention) mentions.push(mention)
  })
  projectStore.terminology.forEach(term => {
    const mention = findLastMention(term.term, 'term')
    if (mention) mentions.push(mention)
  })
  mentions.sort((a, b) => b.lastChapterIndex - a.lastChapterIndex)
  return mentions.slice(0, 10)
})

const currentChapterSummaryHtml = computed(() => {
  const content = currentChapter.value?.summary || ''
  if (!content) return ''
  if (isHtml(content)) {
    return content
  }
  const parsed = marked.parse(content, { async: false }) as string
  return parsed
})

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit,
    BubbleMenuExtension.configure({
      shouldShow: ({ editor }) => {
        return !editor.state.selection.empty && editor.isEditable
      },
    }),
    Placeholder.configure({
      placeholder: 'Start writing your chapter...',
    }),
    Markdown,
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-lg max-w-none focus:outline-none font-serif text-lg leading-relaxed',
    },
  },
  onUpdate: ({ editor }) => {
    const html = editor.getHTML()
    editorStore.setContent(html)
    
    // Auto-save content to the store if a chapter is selected
    if (currentChapterId.value) {
       projectStore.updateChapter(currentChapterId.value, { content: html })
    }
    
    // Update page count when content changes
    updatePageCount()
  },
})

// Helper to load chapter content into editor
const loadChapterContent = () => {
  if (!currentChapterId.value || !editor.value) return
  
  const chapter = projectStore.storyOutline.find(c => c.id === currentChapterId.value)
  if (chapter) {
    const chapterContent = chapter.content || ''
    // Convert markdown to HTML, then clean any remaining mixed content
    let htmlContent = getContentType(chapterContent) === 'markdown' 
      ? (marked.parse(chapterContent, { async: false }) as string)
      : chapterContent
    htmlContent = cleanMixedContent(htmlContent)
    editor.value.commands.setContent(htmlContent, { emitUpdate: false })
    // Update page count after content loads
    updatePageCount()
  }
}

// Watch for chapter selection changes to load content
watch(currentChapterId, (newId) => {
  if (newId) {
    loadChapterContent()
  }
})

// Watch for editor instance availability (in case it initializes after currentChapterId is set)
watch(editor, (newEditor) => {
  if (newEditor && currentChapterId.value) {
    loadChapterContent()
  }
})

// Watch for store changes (in case loaded from DB)
watch(() => projectStore.storyOutline, (chapters) => {
   if (!currentChapterId.value && chapters.length > 0) {
      currentChapterId.value = chapters[0].id
   }
}, { immediate: true })

// Initial page count calculation
onMounted(() => {
  updatePageCount()
})


const promptInput = ref('')
const showPromptInput = ref(false)
const currentSelectionRange = ref<{from: number, to: number} | null>(null)

// Continuity Check State
interface ContinuityReflection {
  issues: string[]
  lineReferences: string[]
  fixes: string[]
  priorityFix: string
  storyImprovements: string[] // New: prose/craft improvements
}
interface ContinuityResult {
  chapterId: string
  chapterTitle: string
  original: string
  suggested: string
  status: 'pending' | 'processing' | 'done' | 'error' | 'skipped'
  beats?: string[] // Extracted story beats from GEPA reflection
  reflection?: ContinuityReflection // GEPA reflection feedback
  iterationCount?: number // Number of improvement passes completed
}
const showContinuityModal = ref(false)
const isContinuityChecking = ref(false)
const continuityResults = ref<ContinuityResult[]>([])
const currentContinuityIndex = ref(0)
const useGEPAContinuity = ref(true)
const gepaContinuityStage = ref<'analyze' | 'reflect' | 'improve' | null>(null)
const gepaIterations = ref(2) // Number of reflect->improve cycles

// Transition Generation State
interface TransitionResult {
  prevChapterId: string
  prevChapterTitle: string
  currChapterId: string
  currChapterTitle: string
  prevEnding: string
  currOpening: string
  suggestedPrevEnding: string
  suggestedCurrOpening: string
  techniqueUsed: string
  notes: string
}
const showTransitionModal = ref(false)
const isGeneratingTransition = ref(false)
const transitionResult = ref<TransitionResult | null>(null)

// Clean up
onBeforeUnmount(() => {
  editor.value?.destroy()
})

// AI Actions
async function generateChapter() {
  if (!currentChapter.value || !editor.value) return
  
  editorStore.isGenerating = true
  
  try {
    const prompt = buildChapterPrompt(currentChapter.value)
    
    // Clear editor to start fresh (or append? Let's assume fresh for "Generate" button)
    editor.value.commands.setContent('')
    
    let markdownBuffer = ''
    const stream = streamText(prompt, 'outline', promptStore.getPrompt('CHAPTER_WRITER'))

    for await (const chunk of stream) {
      markdownBuffer += chunk
      // Convert markdown to HTML for TipTap
      const htmlContent = marked.parse(markdownBuffer, { async: false }) as string
      editor.value.commands.setContent(htmlContent, { emitUpdate: true })
    }

  } catch (e) {
    console.error('Generation failed:', e)
    alert('Failed to generate chapter.')
  } finally {
    editorStore.isGenerating = false
  }
}

async function handleAiPrompt() {
  if (!editor.value) return
  
  const selection = editor.value.state.selection
  const text = editor.value.state.doc.textBetween(selection.from, selection.to)
  
  if (!text.trim()) return

  currentSelectionRange.value = { from: selection.from, to: selection.to }
  
  try {
    editorStore.startGeneration()
    const systemPrompt = buildEditSystemPrompt(currentChapter.value)
    const userPrompt = promptInput.value.trim() || 'Polish this passage for clarity, pacing, and voice without changing facts.'
    const result = await generateText(userPrompt, text, 'selection', systemPrompt)
    editorStore.finishGeneration(result, text)
    showPromptInput.value = false // Close the bubble menu input
    promptInput.value = '' // Reset input
  } catch (error) {
    console.error(error)
    alert('Failed to generate text. Check settings.')
    editorStore.isGenerating = false
  }
}

function applyChanges() {
  if (!editor.value || !currentSelectionRange.value) return

  const suggested = editorStore.suggestedContent
  const contentType = getContentType(suggested)
  const htmlContent = contentType === 'markdown' 
    ? (marked.parse(suggested, { async: false }) as string)
    : suggested
  
  // Replace the selection with the new content
  editor.value.chain().focus()
    .setTextSelection(currentSelectionRange.value)
    .insertContent(htmlContent)
    .run()
    
  editorStore.acceptDiff()
}

function cancelChanges() {
  editorStore.rejectDiff()
}

// Continuity Check Functions
function cleanJsonResponse(text: string): string {
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
  return cleaned.trim()
}

function openContinuityModal() {
  const chaptersWithContent = projectStore.storyOutline.filter(c => c.content && c.content.trim().length > 0)
  if (chaptersWithContent.length === 0) {
    alert('No chapters have content to check. Generate or write some chapters first.')
    return
  }
  continuityResults.value = projectStore.storyOutline.map(c => ({
    chapterId: c.id,
    chapterTitle: c.title,
    original: c.content || '',
    suggested: '',
    status: (c.content && c.content.trim().length > 0) ? 'pending' : 'skipped'
  }))
  currentContinuityIndex.value = 0
  showContinuityModal.value = true
  // Don't start checking yet - let user configure and click Start
}

async function startContinuityCheck() {
  isContinuityChecking.value = true
  gepaContinuityStage.value = null
  
  for (let i = 0; i < continuityResults.value.length; i++) {
    const result = continuityResults.value[i]
    if (result.status === 'skipped') continue
    
    // Update status with array reassignment to ensure reactivity
    continuityResults.value[i] = { ...result, status: 'processing' }
    currentContinuityIndex.value = i
    
    try {
      const prompt = buildContinuityPrompt(i)
      let suggested = ''
      let beats: string[] = []
      let reflection: ContinuityReflection | undefined
      
      if (useGEPAContinuity.value) {
        let currentText = result.original
        const iterations = gepaIterations.value
        
        // Run multiple reflect->improve cycles
        for (let iter = 0; iter < iterations; iter++) {
          // GEPA Stage 1: Analyze/Reflect
          gepaContinuityStage.value = 'reflect'
          const reflectPrompt = `CONTEXT:\n${prompt}\n\nCHAPTER TO ANALYZE:\n${currentText}${iter > 0 ? `\n\n(This is iteration ${iter + 1} of ${iterations} - focus on remaining issues)` : ''}`
          const reflectionRaw = await generateText(reflectPrompt, '', 'outline', promptStore.getPrompt('GEPA_CONTINUITY_REFLECT'))
          
          // Parse reflection (now includes beats and story_improvements)
          type ParsedReflection = { issues: string[]; line_references: string[]; fixes: string[]; priority_fix: string; story_improvements?: string[]; beats?: string[] }
          let parsedReflection: ParsedReflection
          try {
            const cleaned = cleanJsonResponse(reflectionRaw)
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/s)
            parsedReflection = jsonMatch ? JSON.parse(jsonMatch[0]) : { issues: [], line_references: [], fixes: [], priority_fix: '', story_improvements: [], beats: [] }
          } catch {
            parsedReflection = { issues: [], line_references: [], fixes: [], priority_fix: '', story_improvements: [], beats: [] }
          }
          
          // Store extracted beats (only on first iteration)
          if (iter === 0 && parsedReflection.beats && parsedReflection.beats.length > 0) {
            beats = parsedReflection.beats
          }
          
          // Store reflection feedback for display
          reflection = {
            issues: parsedReflection.issues || [],
            lineReferences: parsedReflection.line_references || [],
            fixes: parsedReflection.fixes || [],
            priorityFix: parsedReflection.priority_fix || '',
            storyImprovements: parsedReflection.story_improvements || []
          }

          // Update result with reflection immediately to show analysis in UI
          continuityResults.value[i] = {
            ...result,
            status: 'processing',
            reflection,
            iterationCount: iter + 1
          }
          
          // Check if there's anything significant to improve
          const hasIssues = reflection.issues.length > 0 || reflection.storyImprovements.length > 0
          if (!hasIssues && iter > 0) {
            // No more issues found after first iteration, stop early
            break
          }
          
          // GEPA Stage 2: Improve
          gepaContinuityStage.value = 'improve'
          const improvePrompt = `CONTEXT:\n${prompt}\n\nCHAPTER:\n${currentText}\n\nEDITORIAL ANALYSIS:\n- Continuity Issues: ${parsedReflection.issues.join('; ') || 'None found'}\n- Problem passages: ${parsedReflection.line_references.join('; ') || 'N/A'}\n- Fixes needed: ${parsedReflection.fixes.join('; ') || 'Minor polish'}\n- Story Improvements: ${(parsedReflection.story_improvements || []).join('; ') || 'None needed'}\n- Priority: ${parsedReflection.priority_fix || 'General polish'}${iter > 0 ? `\n\n(Iteration ${iter + 1}/${iterations} - previous improvements applied, refine further)` : ''}`
          
          suggested = await generateText(improvePrompt, '', 'outline', promptStore.getPrompt('GEPA_CONTINUITY_IMPROVE'))
          currentText = suggested // Use improved text for next iteration
        }
      } else {
        // Standard single-pass
        gepaContinuityStage.value = 'analyze'
        suggested = await generateText(prompt, '', 'outline', promptStore.getPrompt('CONTINUITY_CHECK'))
      }
      
      // Update with all results - reassign to ensure reactivity
      continuityResults.value[i] = {
        ...result,
        status: 'done',
        suggested,
        beats: beats.length > 0 ? beats : undefined,
        reflection
      }
    } catch (e) {
      console.error(`Continuity check failed for chapter ${result.chapterTitle}:`, e)
      continuityResults.value[i] = { ...result, status: 'error' }
    }
  }
  
  isContinuityChecking.value = false
  gepaContinuityStage.value = null
}

function applyContinuityChange(index: number) {
  const result = continuityResults.value[index]
  if (result.status !== 'done' || !result.suggested) return
  
  // Convert and clean the suggested content
  let cleanedContent = getContentType(result.suggested) === 'markdown'
    ? (marked.parse(result.suggested, { async: false }) as string)
    : result.suggested
  cleanedContent = cleanMixedContent(cleanedContent)
  
  // Build update object with content and optionally beats
  const updateData: { content: string; beats?: Array<{ id: string; text: string; resolved: boolean }> } = { 
    content: cleanedContent 
  }
  
  // If beats were extracted, convert to beat objects and mark as resolved (since they exist in the chapter)
  if (result.beats && result.beats.length > 0) {
    updateData.beats = result.beats.map(text => ({
      id: crypto.randomUUID(),
      text: String(text),
      resolved: true // Mark as resolved since we're extracting from existing content
    }))
  }
  
  projectStore.updateChapter(result.chapterId, updateData)
  result.original = cleanedContent
  result.suggested = ''
  result.status = 'skipped'
  if (currentChapterId.value === result.chapterId && editor.value) {
    editor.value.commands.setContent(cleanedContent, { emitUpdate: true })
  }
}

function applyAllContinuityChanges() {
  continuityResults.value.forEach((result, index) => {
    if (result.status === 'done' && result.suggested) {
      applyContinuityChange(index)
    }
  })
}

function closeContinuityModal() {
  showContinuityModal.value = false
  continuityResults.value = []
}

/**
 * Generates a smooth transition between the current chapter and the previous one
 */
async function generateTransition() {
  if (!currentChapter.value) return
  
  const currentIndex = projectStore.storyOutline.findIndex(c => c.id === currentChapter.value!.id)
  if (currentIndex <= 0) {
    alert('Cannot generate transition for the first chapter. Select a chapter that has a previous chapter.')
    return
  }
  
  const prevChapter = projectStore.storyOutline[currentIndex - 1]
  const currChapter = currentChapter.value
  
  if (!prevChapter.content || !currChapter.content) {
    alert('Both the previous and current chapters need content to generate a transition.')
    return
  }
  
  isGeneratingTransition.value = true
  showTransitionModal.value = true
  transitionResult.value = null
  
  try {
    // Extract the ending of previous chapter (last 3 paragraphs)
    const prevBlocks = getHtmlBlocks(prevChapter.content)
    const prevEnding = prevBlocks.slice(-3).map(b => stripHtml(b)).join('\n\n')
    
    // Extract the opening of current chapter (first 3 paragraphs)
    const currBlocks = getHtmlBlocks(currChapter.content || '')
    const currOpening = currBlocks.slice(0, 3).map(b => stripHtml(b)).join('\n\n')
    
    // Build context
    const characterDetails = projectStore.characterOutline
      .map(c => `${c.name} (${c.role}): ${c.traits}`)
      .join('\n')
    
    const prompt = `STORY CONTEXT:
Book: ${projectStore.bookMetadata.title}
Genre: ${projectStore.bookMetadata.genre}
${characterDetails ? `Characters:\n${characterDetails}` : ''}

PREVIOUS CHAPTER ("${prevChapter.title}") ENDING:
${prevEnding}

CURRENT CHAPTER ("${currChapter.title}") OPENING:
${currOpening}

Generate a smooth transition between these chapters.`

    const response = await generateText(prompt, '', 'outline', promptStore.getPrompt('TRANSITION_GENERATOR'))
    
    // Parse response
    const cleaned = cleanJsonResponse(response)
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/s)
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      transitionResult.value = {
        prevChapterId: prevChapter.id,
        prevChapterTitle: prevChapter.title,
        currChapterId: currChapter.id,
        currChapterTitle: currChapter.title,
        prevEnding,
        currOpening,
        suggestedPrevEnding: parsed.prev_chapter_ending || '',
        suggestedCurrOpening: parsed.curr_chapter_opening || '',
        techniqueUsed: parsed.technique_used || '',
        notes: parsed.notes || ''
      }
    }
  } catch (err) {
    console.error('Transition generation failed:', err)
    alert('Failed to generate transition. Please try again.')
    showTransitionModal.value = false
  } finally {
    isGeneratingTransition.value = false
  }
}

/**
 * Applies the suggested transition to both chapters
 */
function applyTransition(which: 'prev' | 'curr' | 'both') {
  if (!transitionResult.value) return
  
  const result = transitionResult.value
  
  if (which === 'prev' || which === 'both') {
    // Update previous chapter ending - replace last 3 paragraphs
    const prevChapter = projectStore.storyOutline.find(c => c.id === result.prevChapterId)
    if (prevChapter && prevChapter.content) {
      const prevBlocks = getHtmlBlocks(prevChapter.content)
      // Keep all but last 3 paragraphs
      const keepBlocks = prevBlocks.slice(0, -3)
      // Convert AI text to HTML paragraphs
      const newEndingHtml = result.suggestedPrevEnding.split(/\n\n+/).map(p => `<p>${p}</p>`).join('')
      
      const newContent = keepBlocks.join('') + newEndingHtml
      projectStore.updateChapter(result.prevChapterId, { content: newContent })
    }
  }
  
  if (which === 'curr' || which === 'both') {
    // Update current chapter opening - replace first 3 paragraphs
    const currChapter = projectStore.storyOutline.find(c => c.id === result.currChapterId)
    if (currChapter && currChapter.content) {
      const currBlocks = getHtmlBlocks(currChapter.content)
      // Keep all but first 3 paragraphs
      const keepBlocks = currBlocks.slice(3)
      // Convert AI text to HTML paragraphs
      const newOpeningHtml = result.suggestedCurrOpening.split(/\n\n+/).map(p => `<p>${p}</p>`).join('')
      
      const newContent = newOpeningHtml + keepBlocks.join('')
      projectStore.updateChapter(result.currChapterId, { content: newContent })
      
      if (currentChapterId.value === result.currChapterId && editor.value) {
        editor.value.commands.setContent(newContent, { emitUpdate: true })
      }
    }
  }
  
  showTransitionModal.value = false
  transitionResult.value = null
}

function closeTransitionModal() {
  showTransitionModal.value = false
  transitionResult.value = null
}

/**
 * Formats paragraphs by ensuring proper spacing between them
 * Splits text on double newlines, breaks walls of text, and converts breaks to paragraphs
 */
function formatParagraphs() {
  if (!editor.value) return
  
  console.log('Formatting paragraphs...')
  const html = editor.value.getHTML()
  const tmp = document.createElement('div')
  tmp.innerHTML = html

  let hasChanges = false
  const output: string[] = []

  // Function to split a text block into logical paragraphs
  const splitBlock = (content: string): string[] => {
    // Replace <br> with special marker
    let processed = content.replace(/<br\s*\/?>/gi, '\n')
    
    // If no newlines, check for "wall of text" signals (double spaces, or long text)
    if (!processed.includes('\n')) {
      // Split on double spaces
      if (processed.includes('  ')) {
         processed = processed.replace(/\s{2,}/g, '\n')
      } 
      // Split on sentence endings if very long (>300 chars)
      else if (processed.length > 300) {
         // Look for periods followed by space, but try to avoid abbreviations (Dr., Mr., etc)
         // This is a heuristic and might over-split, but user can merge back
         processed = processed.replace(/(?<=[a-z]{3}[.!?])\s+(?=[A-Z])/g, '\n')
      }
    }

    return processed
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
  }

  // Process existing paragraphs or raw text nodes
  const nodes = Array.from(tmp.childNodes)
  
  if (nodes.length === 0 && tmp.textContent) {
     // Pure text case
     const lines = splitBlock(tmp.textContent)
     if (lines.length > 1) {
        lines.forEach(line => output.push(`<p>${line}</p>`))
        hasChanges = true
     }
  } else {
     nodes.forEach(node => {
        if (node.nodeName === 'P' || node.nodeName === 'DIV') {
           const text = (node as HTMLElement).innerHTML
           const lines = splitBlock(text)
           if (lines.length > 1 || (lines.length === 1 && lines[0] !== text.trim())) {
              lines.forEach(line => output.push(`<p>${line}</p>`))
              hasChanges = true
           } else {
              output.push(`<p>${text}</p>`)
           }
        } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
           const lines = splitBlock(node.textContent)
           lines.forEach(line => output.push(`<p>${line}</p>`))
           hasChanges = true
        } else if ((node as HTMLElement).outerHTML) {
           output.push((node as HTMLElement).outerHTML)
        }
     })
  }

  if (hasChanges) {
    console.log('Applying paragraph formatting...')
    editor.value.commands.setContent(output.join(''), { emitUpdate: true })
  } else {
    console.log('No paragraph formatting needed found.')
  }
}
</script>

<template>
  <div class="relative h-full flex flex-col bg-base-200/50">
    <!-- Toolbar / Header -->
    <div class="navbar bg-base-100 border-b border-base-300 px-6 min-h-[4rem] sticky top-0 z-10 flex justify-between">
      <div class="flex-1 flex items-center gap-4">
        <!-- Chapter Selector Dropdown -->
        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-ghost text-xl font-bold gap-2 normal-case px-2">
             <span class="w-2 h-2 rounded-full" :class="currentChapter?.status === 'complete' ? 'bg-success' : 'bg-warning'"></span>
             {{ currentChapter?.title || 'Select a Chapter' }}
             <ChevronDown class="w-4 h-4 opacity-50" />
          </div>
          <ul tabindex="0" class="dropdown-content z-999 absolute menu p-2 shadow bg-base-100 rounded-box w-72 max-h-96 overflow-y-auto flex-nowrap">
            <li v-for="chapter in projectStore.storyOutline" :key="chapter.id">
               <a @click="currentChapterId = chapter.id" :class="{ 'active': currentChapterId === chapter.id }">
                 <FileText class="w-4 h-4 opacity-70" />
                 <span class="truncate">{{ chapter.title }}</span>
               </a>
            </li>
             <li v-if="projectStore.storyOutline.length === 0" class="text-center p-4 text-sm opacity-50">
                No chapters yet. Create an outline first!
             </li>
          </ul>
        </div>
      </div>

      <div class="flex-none flex items-center gap-2">
        <!-- Generate Chapter Button (when empty) -->
        <button 
          v-if="currentChapterId && editor && editor.getText().trim() === '' && !editorStore.isGenerating"
          @click="generateChapter" 
          class="btn btn-primary gap-2"
        >
          <Wand2 class="w-4 h-4" />
          Generate Chapter
        </button>

        <!-- Continuity Check Button -->
        <button 
          v-if="projectStore.storyOutline.some(c => c.content && c.content.trim().length > 0)"
          @click="openContinuityModal" 
          class="btn btn-ghost gap-2"
          :disabled="isContinuityChecking"
        >
          <GitCompare class="w-4 h-4" />
          Confirm Continuity
        </button>

        <!-- Transition Generator Button -->
        <button 
          v-if="currentChapterId && currentChapter && projectStore.storyOutline.findIndex(c => c.id === currentChapterId) > 0"
          @click="generateTransition" 
          class="btn btn-ghost gap-2"
          :disabled="isGeneratingTransition"
          title="Generate smooth transition from previous chapter"
        >
          <ArrowLeftRight class="w-4 h-4" />
          Transition
        </button>

        <!-- Format Paragraphs Button -->
        <button 
          v-if="currentChapterId && editor && editor.getText().trim() !== ''"
          @click="formatParagraphs" 
          class="btn btn-ghost btn-sm gap-1"
          title="Format paragraphs - add proper spacing"
        >
          <Pilcrow class="w-4 h-4" />
          Format ¶
        </button>

        <div v-if="editorStore.isGenerating" class="flex items-center gap-2 text-primary animate-pulse font-medium mr-4">
          <Wand2 class="w-4 h-4 animate-spin" />
          Writing...
        </div>

        <!-- Toggle Sidebar -->
        <button @click="showSidebar = !showSidebar" class="btn btn-ghost btn-circle" title="Toggle Synopsis">
           <PanelRightOpen v-if="!showSidebar" class="w-5 h-5" />
           <PanelRightClose v-else class="w-5 h-5" />
        </button>
      </div>
    </div>

    <div class="flex-1 flex overflow-hidden relative">
      <!-- Main Editor Area -->
      <div class="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center relative bg-base-200">
        <div v-if="!currentChapterId" class="flex flex-col items-center justify-center h-96 text-base-content/40">
           <FileText class="w-16 h-16 mb-4 opacity-20" />
           <p class="text-lg">Select a chapter to start writing</p>
        </div>
        
        <!-- Multi-page editor container -->
        <div v-else class="editor-pages w-full max-w-[8.5in] py-8 pb-24 relative">
          <!-- Render visual pages as backgrounds (absolute behind content) -->
          <div class="absolute inset-0 w-full pointer-events-none flex flex-col items-center pt-8">
            <div 
              v-for="pageNum in pageCount" 
              :key="`page-${pageNum}`"
              class="editor-page-frame bg-white shadow-lg border border-base-300 relative shrink-0"
              :class="{ 'page-divider': pageNum < pageCount }"
            >
              <!-- Page number indicator -->
              <div class="absolute bottom-2 right-4 text-xs text-base-content/30 pointer-events-none z-20">
                Page {{ pageNum }}
              </div>
            </div>
          </div>
          
          <!-- Editor content flows over all pages (Relative - drives height) -->
          <div ref="editorContainer" class="editor-content-overlay relative z-1">
            <editor-content :editor="editor" />
          </div>
        </div>
        
        <!-- Bubble Menu (existing) -->
        <bubble-menu v-if="editor" :editor="editor" :tippy-options="{ duration: 100, placement: 'bottom' }" class="bg-base-300 shadow-xl rounded-full p-1 flex items-center gap-1 border border-base-content/10 transform -translate-y-2">
          <!-- ... same content as before ... -->
          <div v-if="!showPromptInput" class="flex items-center p-1">
            <button @click="showPromptInput = true" class="btn btn-sm btn-primary rounded-full px-4 shadow-sm hover:shadow-md transition-all">
              <Wand2 class="w-4 h-4 mr-1" />
              AI Edit
            </button>
            <div class="w-px h-6 bg-base-content/10 mx-2"></div>
            <button @click="editor.chain().focus().toggleBold().run()" :class="{ 'bg-base-content/10 text-primary': editor.isActive('bold') }" class="btn btn-sm btn-ghost btn-square rounded-full"><Bold class="w-4 h-4" /></button>
            <button @click="editor.chain().focus().toggleItalic().run()" :class="{ 'bg-base-content/10 text-primary': editor.isActive('italic') }" class="btn btn-sm btn-ghost btn-square rounded-full"><Italic class="w-4 h-4" /></button>
          </div>
          <div v-else class="flex gap-2 items-center p-1 animate-in fade-in zoom-in duration-200">
            <div class="join shadow-sm">
              <input v-model="promptInput" @keyup.enter="handleAiPrompt" type="text" placeholder="How should I change this?" class="input input-sm input-bordered join-item w-64 focus:outline-none" autoFocus />
              <button @click="handleAiPrompt" class="btn btn-sm btn-primary join-item"><Wand2 class="w-4 h-4" /></button>
            </div>
            <button @click="showPromptInput = false" class="btn btn-sm btn-circle btn-ghost"><X class="w-4 h-4" /></button>
          </div>
        </bubble-menu>
      </div>

      <!-- Sidebar -->
      <div v-if="showSidebar && currentChapter" class="w-80 bg-base-100 border-l border-base-300 flex flex-col shadow-xl z-20 animate-in slide-in-from-right duration-300">
         <div class="p-6 overflow-y-auto flex-1">
            <h3 class="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Chapter Synopsis</h3>
            <div class="prose prose-sm mb-6" v-html="currentChapterSummaryHtml"></div>

            <!-- Story Beats Section -->
            <div class="mb-8">
               <BeatsPanel
                  :beats="chapterBeats"
                  :is-generating="isGeneratingBeats"
                  :use-gepa="useGEPABeats"
                  :gepa-stage="gepaBeatStage"
                  @update:use-gepa="useGEPABeats = $event"
                  @add="addBeatFromPanel"
                  @toggle="toggleBeat"
                  @remove="removeBeat"
                  @generate="generateBeats"
               />
            </div>

            <h3 class="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Characters Present</h3>
            <div class="space-y-3">
               <div v-for="char in chapterCharacters" :key="char.id" class="flex items-start gap-3 p-2 rounded-lg bg-base-200/50">
                  <div class="avatar">
                    <div class="w-8 h-8 rounded-full text-base-content/40">
                      <UserCircle2 class="w-full h-full" />
                    </div>
                  </div>
                  <div>
                     <div class="font-bold text-sm">{{ char.name }}</div>
                     <div class="text-xs opacity-60 line-clamp-2">{{ char.bio }}</div>
                  </div>
               </div>
               <div v-if="chapterCharacters.length === 0" class="text-sm opacity-50 italic">
                  No characters tagged in this chapter.
               </div>
            </div>

            <!-- Voice Board Section -->
            <div v-if="povCharacters.length > 0" class="mt-8">
               <h3 class="text-xs font-bold uppercase tracking-wider opacity-50 mb-3 flex items-center gap-2">
                  <Mic class="w-3 h-3" />
                  Voice Board
               </h3>
               <div class="space-y-4">
                  <div 
                     v-for="char in povCharacters" 
                     :key="char.id"
                     class="p-3 rounded-lg bg-gradient-to-br from-primary/5 to-secondary/5 border border-primary/20"
                  >
                     <div class="font-bold text-sm mb-2 flex items-center gap-2">
                        <UserCircle2 class="w-4 h-4 text-primary" />
                        {{ char.name }}'s Voice
                     </div>
                     
                     <!-- Diction Rules -->
                     <div v-if="char.voiceDiction" class="mb-2">
                        <div class="text-[10px] uppercase tracking-wide text-primary/70 font-bold mb-1">Diction</div>
                        <p class="text-xs text-base-content/70 leading-relaxed">{{ char.voiceDiction }}</p>
                     </div>

                     <!-- Forbidden Phrases -->
                     <div v-if="char.voiceForbidden" class="mb-2">
                        <div class="text-[10px] uppercase tracking-wide text-warning font-bold mb-1 flex items-center gap-1">
                           <AlertTriangle class="w-2.5 h-2.5" />
                           Avoid
                        </div>
                        <div class="flex flex-wrap gap-1">
                           <span 
                              v-for="(phrase, i) in char.voiceForbidden.split(',').map(p => p.trim()).filter(Boolean).slice(0, 6)" 
                              :key="i"
                              class="badge badge-xs badge-warning badge-outline"
                           >{{ phrase }}</span>
                        </div>
                     </div>

                     <!-- Signature Metaphors -->
                     <div v-if="char.voiceMetaphors">
                        <div class="text-[10px] uppercase tracking-wide text-secondary/70 font-bold mb-1 flex items-center gap-1">
                           <Quote class="w-2.5 h-2.5" />
                           Signatures
                        </div>
                        <p class="text-xs text-base-content/70 italic leading-relaxed">{{ char.voiceMetaphors }}</p>
                     </div>

                     <!-- Empty state if no voice rules defined -->
                     <div v-if="!char.voiceDiction && !char.voiceForbidden && !char.voiceMetaphors" class="text-xs text-base-content/40 italic">
                        No voice rules defined. Edit character to add.
                     </div>
                  </div>
               </div>
            </div>

            <!-- Recent Canon Section -->
            <div v-if="recentCanon.length > 0" class="mt-8">
               <h3 class="text-xs font-bold uppercase tracking-wider opacity-50 mb-3 flex items-center gap-2">
                  <History class="w-3 h-3" />
                  Recent Canon
               </h3>
               <div class="space-y-2">
                  <div 
                     v-for="mention in recentCanon" 
                     :key="`${mention.type}-${mention.entity}`"
                     class="p-3 rounded-lg bg-base-200/50 border border-base-300/50 hover:border-primary/30 transition-colors"
                  >
                     <div class="flex items-center gap-2 mb-1">
                        <component 
                           :is="mention.type === 'character' ? Users : BookOpen" 
                           class="w-3 h-3 opacity-60"
                        />
                        <span class="font-semibold text-sm">{{ mention.entity }}</span>
                        <span class="badge badge-xs badge-ghost ml-auto">Ch. {{ mention.lastChapterIndex }}</span>
                     </div>
                     <div class="text-xs text-base-content/60 line-clamp-2 italic leading-relaxed">
                        "{{ mention.excerpt }}"
                     </div>
                     <div class="text-[10px] text-base-content/40 mt-1 truncate">
                        {{ mention.lastChapterTitle }}
                     </div>
                  </div>
               </div>
               <p class="text-[10px] text-base-content/40 mt-3 italic">
                  Entities mentioned in this chapter that appear in previous chapters.
               </p>
            </div>
         </div>
      </div>
    </div>
    
    <!-- Diff Modal (same as before) -->
    <div v-if="editorStore.showDiff" class="modal modal-open backdrop-blur-sm">
       <!-- ... same content ... -->
       <div class="modal-box w-11/12 max-w-4xl shadow-2xl border border-base-200">
        <div class="flex justify-between items-center mb-6">
           <h3 class="font-bold text-xl flex items-center gap-2"><Wand2 class="w-5 h-5 text-primary" />Review Suggestions</h3>
           <div class="text-sm text-base-content/60">Review changes before applying</div>
        </div>
        <div class="grid grid-cols-1 gap-4 mb-6">
          <div class="bg-base-100 p-6 rounded-xl border border-base-200 shadow-inner max-h-[60vh] overflow-y-auto">
            <DiffViewer :original="editorStore.originalContent" :suggested="editorStore.suggestedContent" />
          </div>
        </div>
        <div class="modal-action border-t border-base-200 pt-4 mt-0">
          <button @click="cancelChanges" class="btn btn-ghost hover:bg-base-200">Reject</button>
          <button @click="applyChanges" class="btn btn-primary px-8"><Check class="w-4 h-4 mr-2" />Accept Changes</button>
        </div>
      </div>
    </div>

    <!-- Continuity Check Modal -->
    <ContinuityCheckModal
      v-if="showContinuityModal"
      :results="continuityResults"
      :current-index="currentContinuityIndex"
      :is-checking="isContinuityChecking"
      :use-gepa="useGEPAContinuity"
      :gepa-stage="gepaContinuityStage"
      :iterations="gepaIterations"
      @update:current-index="currentContinuityIndex = $event"
      @update:use-gepa="useGEPAContinuity = $event"
      @update:iterations="gepaIterations = $event"
      @start="startContinuityCheck"
      @apply="applyContinuityChange"
      @apply-all="applyAllContinuityChanges"
      @close="closeContinuityModal"
    />

    <!-- Transition Generator Modal -->
    <TransitionModal
      v-if="showTransitionModal"
      :is-generating="isGeneratingTransition"
      :result="transitionResult"
      @apply="applyTransition"
      @close="closeTransitionModal"
    />

  </div>
</template>

<style>
/* Tiptap Prose Overrides */
.ProseMirror {
  outline: none;
  min-height: 100%;
}

.ProseMirror p.is-editor-empty:first-child::before {
  color: #adb5bd;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

/* Page-like styling */
.editor-pages {
  position: relative;
  min-height: 100vh;
}

.editor-page-frame {
  width: 8.5in;
  height: 11in;
  margin: 0 auto;
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 10px 30px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.3s ease;
  pointer-events: none; /* Allow clicks to pass through to editor */
}

/* Visual page divider - subtle line at page boundary */
.page-divider {
  position: relative;
}

.page-divider::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(to right, 
    transparent 0%, 
    rgba(0, 0, 0, 0.08) 15%, 
    rgba(0, 0, 0, 0.12) 50%, 
    rgba(0, 0, 0, 0.08) 85%, 
    transparent 100%);
  pointer-events: none;
  z-index: 15;
}

/* Add a subtle top shadow on the next page for depth */
.page-divider + .editor-page-frame {
  box-shadow: 
    0 -2px 4px rgba(0, 0, 0, 0.04),
    0 1px 3px rgba(0, 0, 0, 0.12),
    0 10px 30px rgba(0, 0, 0, 0.08);
}

.editor-page-frame:hover {
  box-shadow: 
    0 2px 6px rgba(0, 0, 0, 0.15),
    0 15px 40px rgba(0, 0, 0, 0.12);
}

.editor-content-overlay {
  /* Position is now handled by relative layout */
  width: 8.5in;
  margin: 0 auto;
}

.editor-content-overlay .ProseMirror {
  min-height: var(--page-height);
  padding: 1in 1in 1.5in;
  width: 100%;
  box-sizing: border-box;
  text-indent: 1.5em;
}

.editor-content-overlay .ProseMirror > p {
  text-indent: 1.5em;
  margin-top: 0.75rem;
  /* Prevent paragraphs from breaking across page boundaries */
  break-inside: avoid;
  page-break-inside: avoid;
  /* Ensure at least 2 lines before/after a break */
  orphans: 2;
  widows: 2;
}

.editor-content-overlay .ProseMirror > p:first-child {
  margin-top: 0;
}

/* Add subtle visual hints at page boundaries */
.editor-content-overlay .ProseMirror > *:nth-child(n) {
  /* Keep paragraphs together when possible */
  break-inside: avoid;
}

.editor-content-overlay .ProseMirror strong,
.editor-content-overlay .ProseMirror b {
  font-weight: 700;
}

/* Improve scrollbar in editor container */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}

/* Print styles */
@media print {
  .editor-page {
    box-shadow: none;
    border: none;
    margin: 0;
    padding: 0;
    page-break-after: always;
  }
}
</style>
