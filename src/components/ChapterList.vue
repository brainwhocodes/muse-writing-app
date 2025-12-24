<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore, type StoryChapter } from '../stores/project'
import { Plus, Wand2, Sparkles, Trash2, CheckSquare, Square, RefreshCw, Users, BookOpen, Tag } from 'lucide-vue-next'
import { generateText } from '../services/ai'
import ChapterItem from './ChapterItem.vue'
import ChapterEditor from './ChapterEditor.vue'
import { marked } from 'marked'
import { stripHtml } from '../composables/useTextUtils'
import { useChapterContext } from '../composables/useChapterContext'
import { useRollingContext } from '../composables/useRollingContext'
import { useGepa, GEPA_DIMENSIONS } from '../composables/useGepa'
import { usePromptStore } from '../stores/prompts'

const projectStore = useProjectStore()
const promptStore = usePromptStore()
const { buildChapterPrompt } = useChapterContext()
const { updateContextMetadata } = useRollingContext()
const { optimize: gepaOptimize, progress: gepaProgress } = useGepa()

// ---------------------------------------------------------
// State
// ---------------------------------------------------------
const isGenerating = ref(false)
const isImprovingPrompt = ref(false)
const showGenerateModal = ref(false)
const showBatchModal = ref(false)

// Generate outline form
const outlineForm = ref({
  premise: '',
  genre: '',
  ageGroup: '',
  chapterCount: 10,
  tone: '',
  generateChapters: true,
  generateCharacters: true,
  generateTerminology: true
})
const isBatchGenerating = ref(false)
const batchProgress = ref('')
const overwriteExisting = ref(false)
const useGEPA = ref(true) // GEPA: Reflective Prompt Evolution
const generatingChapterId = ref<string | null>(null)
const generatingTransitionId = ref<string | null>(null)
const gepaStage = ref<'draft' | 'reflect' | 'improve' | null>(null)

// Multi-select State
const isSelectMode = ref(false)
const selectedChapterIds = ref<Set<string>>(new Set())

const allSelected = computed(() => {
  return projectStore.storyOutline.length > 0 && 
         selectedChapterIds.value.size === projectStore.storyOutline.length
})

const someSelected = computed(() => selectedChapterIds.value.size > 0)

// Edit / New State
// editingId is null when nothing is being edited
// when adding new, editingId is 'NEW'
const editingId = ref<string | null>(null)
const insertIndex = ref<number | undefined>(undefined)
const editForm = ref<Partial<StoryChapter>>({})

// ---------------------------------------------------------
// Actions
// ---------------------------------------------------------

function startEdit(chapter: StoryChapter) {
  // If we are already editing something, cancel it first? Or just switch?
  // Let's switch.
  editingId.value = chapter.id
  insertIndex.value = undefined
  editForm.value = { ...chapter, characters: [...(chapter.characters || [])] }
}

function startAdd(atIndex?: number) {
  editingId.value = 'NEW'
  insertIndex.value = atIndex
  editForm.value = { title: '', summary: '', status: 'draft', characters: [] }
}

function cancelEdit() {
  editingId.value = null
  insertIndex.value = undefined
  editForm.value = {}
}

function saveEdit() {
  if (!editForm.value) return

  if (editingId.value === 'NEW') {
    projectStore.addChapter({ 
       title: editForm.value.title || 'Untitled', 
       summary: editForm.value.summary || '', 
       status: editForm.value.status || 'draft',
       characters: editForm.value.characters || []
    }, insertIndex.value)
  } else if (editingId.value) {
    projectStore.updateChapter(editingId.value, editForm.value)
  }
  
  cancelEdit()
}

// ---------------------------------------------------------
// AI Generation
// ---------------------------------------------------------

function buildOutlinePrompt(): string {
  const parts: string[] = []
  if (outlineForm.value.premise) {
    parts.push(`Story Premise: ${outlineForm.value.premise}`)
  }
  if (outlineForm.value.genre) {
    parts.push(`Genre: ${outlineForm.value.genre}`)
  }
  if (outlineForm.value.ageGroup) {
    parts.push(`Audience Age Group: ${outlineForm.value.ageGroup}`)
  }
  if (outlineForm.value.tone) {
    parts.push(`Tone/Style: ${outlineForm.value.tone}`)
  }
  parts.push(`Target chapter count: ${outlineForm.value.chapterCount}`)
  return parts.join('\n\n')
}

async function improvePrompt() {
  if (!outlineForm.value.premise.trim()) return
  
  isImprovingPrompt.value = true
  try {
    const improveSystemPrompt = `You are a story development expert. Take the user's basic story premise and enhance it into a richer, more detailed story concept. Add specificity, stakes, character hints, and thematic depth. Keep the core idea but make it more compelling and writable. Return ONLY the improved premise text, no explanations.`
    
    const result = await generateText(outlineForm.value.premise, '', 'outline', improveSystemPrompt)
    if (result) {
      outlineForm.value.premise = result.trim()
    }
  } catch (e) {
    console.error(e)
  } finally {
    isImprovingPrompt.value = false
  }
}

function resetOutlineForm() {
  outlineForm.value = { 
    premise: '', 
    genre: '', 
    ageGroup: '',
    chapterCount: 10, 
    tone: '',
    generateChapters: true,
    generateCharacters: true,
    generateTerminology: true
  }
}

function cleanJsonResponse(text: string): string {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '')
  // Trim whitespace
  cleaned = cleaned.trim()
  return cleaned
}

function parseJsonSafe<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch (err) {
    console.warn('JSON parse failed, returning fallback', err)
    return fallback
  }
}

function extractChapterNumber(title: string): number {
  // Try to extract chapter number from title like "Chapter 1: Title" or "1. Title" or "Chapter One"
  const patterns = [
    /chapter\s*(\d+)/i,           // "Chapter 1" or "Chapter 10"
    /^(\d+)\.\s*/,                // "1. Title"
    /^(\d+)\s*[-:]/,              // "1: Title" or "1 - Title"
  ]
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) return parseInt(match[1], 10)
  }
  // Word numbers
  const wordNumbers: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15
  }
  const wordMatch = title.toLowerCase().match(/chapter\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)/i)
  if (wordMatch) return wordNumbers[wordMatch[1].toLowerCase()] || 999
  return 999 // Default to end if no number found
}

function sortChaptersByNumber<T extends { title: string }>(chapters: T[]): T[] {
  return [...chapters].sort((a, b) => extractChapterNumber(a.title) - extractChapterNumber(b.title))
}

async function generateOutline() {
  if (!outlineForm.value.premise.trim()) return
  
  isGenerating.value = true
  try {
    // Save the original premise for reference
    projectStore.bookMetadata.originalPremise = outlineForm.value.premise.trim()
    
    const prompt = buildOutlinePrompt()
    const wantsFullGeneration = outlineForm.value.generateCharacters || outlineForm.value.generateTerminology
    // Use improved prompts from store if available
    const systemPrompt = wantsFullGeneration 
      ? promptStore.getPrompt('STORY_ARCHITECT')
      : promptStore.getPrompt('CHAPTER_OUTLINER')
    const rawResult = await generateText(prompt, '', 'outline', systemPrompt)
    const result = cleanJsonResponse(rawResult)
    
    // Try to parse as full story object first
    const objectMatch = result.match(/\{[\s\S]*\}/s)
    if (objectMatch && wantsFullGeneration) {
      let storyData: { chapters?: Array<{ title: string; summary: string }>; characters?: Array<{ name: string; role: string; bio: string; traits: string }>; terminology?: Array<{ term: string; definition: string; category?: string }> }
      try {
        storyData = JSON.parse(objectMatch[0])
      } catch (parseError) {
        console.error('JSON parse error, trying to fix...', parseError)
        const fixedJson = objectMatch[0]
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
        storyData = JSON.parse(fixedJson)
      }

      // Extract Story Bible from premise + outline
      try {
        const biblePromptParts = [
          `Premise: ${outlineForm.value.premise}`,
          outlineForm.value.genre ? `Genre: ${outlineForm.value.genre}` : '',
          outlineForm.value.ageGroup ? `Audience: ${outlineForm.value.ageGroup}` : '',
          outlineForm.value.tone ? `Tone: ${outlineForm.value.tone}` : '',
          storyData.chapters ? `Outline:\n${storyData.chapters.map((c, i) => `${i + 1}. ${c.title}: ${c.summary}`).join('\n')}` : ''
        ].filter(Boolean)
        const bibleRaw = await generateText(biblePromptParts.join('\n\n'), '', 'outline', promptStore.getPrompt('STORY_BIBLE_EXTRACTOR'))
        const bibleClean = cleanJsonResponse(bibleRaw)
        const bibleParsed = parseJsonSafe<{
          coreThemes?: string
          characterTerminologies?: string
          toneGuidelines?: string
          narrativeArc?: string
          motifs?: string
          worldRules?: string
        }>(bibleClean, {})
        projectStore.storyBible = {
          coreThemes: bibleParsed.coreThemes || '',
          characterTerminologies: bibleParsed.characterTerminologies || '',
          toneGuidelines: bibleParsed.toneGuidelines || '',
          narrativeArc: bibleParsed.narrativeArc || '',
          motifs: bibleParsed.motifs || '',
          worldRules: bibleParsed.worldRules || ''
        }
      } catch (err) {
        console.warn('Story Bible extraction failed', err)
      }

      // Build placeholders (architect pass)
      let placeholders: Array<{ id?: string; title?: string; placeholder?: string; summary?: string }> = []
      try {
        const placeholderPrompt = [
          `Story Bible:\n${JSON.stringify(projectStore.storyBible)}`,
          `Target chapters: ${outlineForm.value.chapterCount}`,
          outlineForm.value.premise ? `Premise:\n${outlineForm.value.premise}` : '',
          storyData.chapters ? `Existing outline:\n${storyData.chapters.map((c, i) => `${i + 1}. ${c.title}: ${c.summary}`).join('\n')}` : ''
        ].filter(Boolean).join('\n\n')
        const placeholderRaw = await generateText(placeholderPrompt, '', 'outline', promptStore.getPrompt('ARCHITECT_PLACEHOLDER'))
        const placeholderClean = cleanJsonResponse(placeholderRaw)
        const match = placeholderClean.match(/\[[\s\S]*\]/s)
        placeholders = match ? parseJsonSafe(match[0], []) : []
      } catch (err) {
        console.warn('Placeholder generation failed', err)
      }

      // Validate placeholders against Story Bible (validator pass)
      let validations: Array<{ id?: string; validatorNotes?: string; draftStatus?: 'idea' | 'skeleton' | 'validated' | 'draft' | 'complete' }> = []
      try {
        if (placeholders.length) {
          const validatorPrompt = [
            `Story Bible:\n${JSON.stringify(projectStore.storyBible)}`,
            `Placeholders:\n${JSON.stringify(placeholders)}`
          ].join('\n\n')
          const validatorRaw = await generateText(validatorPrompt, '', 'outline', promptStore.getPrompt('SKELETON_VALIDATOR'))
          const validatorClean = cleanJsonResponse(validatorRaw)
          const match = validatorClean.match(/\[[\s\S]*\]/s)
          validations = match ? parseJsonSafe(match[0], []) : []
        }
      } catch (err) {
        console.warn('Placeholder validation failed', err)
      }

      // Add chapters (sorted by chapter number) with placeholder + draft status
      if (storyData.chapters && outlineForm.value.generateChapters) {
        const sortedChapters = sortChaptersByNumber(storyData.chapters)
        sortedChapters.forEach((c: { title: string; summary: string }, idx: number) => {
          const placeholder = placeholders[idx]
          const validation = (placeholder && validations.find(v => v.id === placeholder.id)) || validations[idx] || {}
          projectStore.addChapter({
            title: placeholder?.title || c.title || `Chapter ${idx + 1}`,
            summary: c.summary || placeholder?.summary || '',
            status: 'idea',
            draftStatus: validation.draftStatus || (placeholder ? 'skeleton' : 'idea'),
            placeholder: placeholder?.placeholder || '',
            validatorNotes: validation.validatorNotes || '',
            denseSummary: '',
            characters: []
          })
        })
      }
      
      // Add characters
      if (storyData.characters && outlineForm.value.generateCharacters) {
        storyData.characters.forEach((c: { name: string; role: string; bio: string; traits: string }) => {
          projectStore.addCharacter({
            name: c.name,
            role: c.role || 'Supporting',
            bio: c.bio || '',
            traits: c.traits || ''
          })
        })
      }
      
      // Add terminology with GEPA improvement
      if (storyData.terminology && outlineForm.value.generateTerminology) {
        type TermItem = { term: string; definition: string; category?: string }
        let finalTerminology: TermItem[] = storyData.terminology
        
        // Run GEPA optimization on terminology
        try {
          const gepaResult = await gepaOptimize<TermItem[]>(storyData.terminology, {
            taskName: 'story terminology',
            dimensions: GEPA_DIMENSIONS.terminology,
            context: `Genre: ${outlineForm.value.genre || 'Fiction'}
Audience: ${outlineForm.value.ageGroup || 'General'}
Tone: ${outlineForm.value.tone || 'General'}
Premise: ${outlineForm.value.premise}`,
            serialize: (terms) => JSON.stringify(terms, null, 2),
            parse: (response) => {
              const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
              const match = cleaned.match(/\[[\s\S]*\]/s)
              if (match) return JSON.parse(match[0])
              return JSON.parse(cleaned)
            },
            maxIterations: 2,
            targetScore: 0.8
          })
          
          finalTerminology = gepaResult.improved
          console.log(`GEPA terminology: ${gepaResult.iterations} iterations, score: ${(gepaResult.finalScore * 100).toFixed(0)}%`)
        } catch (gepaErr) {
          console.warn('GEPA terminology optimization failed, using original:', gepaErr)
        }

        // Add improved terminology to store
        finalTerminology.forEach((t) => {
          projectStore.addTerm({
            term: t.term,
            definition: t.definition || '',
            notes: '',
            chapters: [],
            category: (t.category as 'place' | 'object' | 'concept' | 'event' | 'other') || 'other',
            aliases: ''
          })
        })
      }
    } else {
      // Fallback: parse as simple array of chapters
      const jsonMatch = result.match(/\[[\s\S]*\]/s)
      if (jsonMatch) {
        let chapters: Array<{ title: string; summary: string }>
        try {
          chapters = JSON.parse(jsonMatch[0])
        } catch {
          const fixedJson = jsonMatch[0].replace(/,\s*]/g, ']')
          chapters = JSON.parse(fixedJson)
        }
        // Sort chapters by number before adding
        const sortedChapters = sortChaptersByNumber(chapters)
        sortedChapters.forEach((c, idx) => {
          projectStore.addChapter({
            title: c.title,
            summary: c.summary,
            status: 'idea',
            draftStatus: 'idea',
            placeholder: '',
            validatorNotes: '',
            denseSummary: '',
            characters: []
          })
        })
      } else {
        projectStore.addChapter({
          title: 'AI Generated Chapter',
          summary: result,
          status: 'idea',
          draftStatus: 'idea',
          placeholder: '',
          validatorNotes: '',
          denseSummary: '',
          characters: []
        })
      }
    }
    
    showGenerateModal.value = false
    resetOutlineForm()
  } catch (e) {
    console.error('Generation error:', e)
    alert('Failed to parse AI response. The model may have returned malformed JSON. Try again or use a different model.')
  } finally {
    isGenerating.value = false
  }
}

async function batchGenerateChapters() {
  isBatchGenerating.value = true
  batchProgress.value = ''
  gepaStage.value = null

  try {
    const chaptersToGenerate = projectStore.storyOutline.filter(chapter => {
      if (chapter.content && !overwriteExisting.value) return false
      const plainSummary = stripHtml(chapter.summary || '')
      return plainSummary.length > 0
    })

  for (let i = 0; i < chaptersToGenerate.length; i++) {
    const chapter = chaptersToGenerate[i]
      const chapterPrompt = buildChapterPrompt(chapter)
      let chapterHtml = ''

      if (useGEPA.value) {
        batchProgress.value = `[${i + 1}/${chaptersToGenerate.length}] ${chapter.title} — Drafting...`
        gepaStage.value = 'draft'
      const draft = await generateText(chapterPrompt, '', 'outline', promptStore.getPrompt('CHAPTER_WRITER_HIERARCHICAL'))
      
      batchProgress.value = `[${i + 1}/${chaptersToGenerate.length}] ${chapter.title} — Reflecting...`
      gepaStage.value = 'reflect'
      const reflectPrompt = `CHAPTER SYNOPSIS:\n${chapterPrompt}\n\nDRAFT TO REVIEW:\n${draft}`
      const reflectionRaw = await generateText(reflectPrompt, '', 'outline', promptStore.getPrompt('GEPA_CHAPTER_REFLECT'))
      
      let reflection: { strengths: string[]; weaknesses: string[]; suggestions: string[]; priority_fix: string }
      try {
        const cleaned = cleanJsonResponse(reflectionRaw)
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/s)
        reflection = jsonMatch ? JSON.parse(jsonMatch[0]) : { strengths: [], weaknesses: [], suggestions: [], priority_fix: 'Improve overall quality' }
      } catch {
        reflection = { strengths: [], weaknesses: [], suggestions: [], priority_fix: 'Improve overall quality' }
      }

      batchProgress.value = `[${i + 1}/${chaptersToGenerate.length}] ${chapter.title} — Improving...`
      gepaStage.value = 'improve'
      const improvePrompt = `ORIGINAL SYNOPSIS:\n${chapterPrompt}\n\nDRAFT:\n${draft}\n\nEDITORIAL FEEDBACK:\n- Strengths: ${reflection.strengths.join('; ')}\n- Weaknesses: ${reflection.weaknesses.join('; ')}\n- Suggestions: ${reflection.suggestions.join('; ')}\n- Priority Fix: ${reflection.priority_fix}`
      
      const improved = await generateText(improvePrompt, '', 'outline', promptStore.getPrompt('GEPA_CHAPTER_IMPROVE'))
      chapterHtml = improved ? await marked.parse(improved) : await marked.parse(draft || '')
      } else {
        batchProgress.value = `[${i + 1}/${chaptersToGenerate.length}] Generating ${chapter.title}...`
        const result = await generateText(chapterPrompt, '', 'outline', promptStore.getPrompt('CHAPTER_WRITER_HIERARCHICAL'))
        if (result) {
          chapterHtml = await marked.parse(result)
        }
      }

      if (chapterHtml) {
        const updatePayload: Partial<StoryChapter> = { content: chapterHtml, draftStatus: 'draft' }
        try {
          const summaryPrompt = `Chapter Title: ${chapter.title}\n\nFull Chapter:\n${stripHtml(chapterHtml)}`
          const summaryRaw = await generateText(summaryPrompt, '', 'outline', promptStore.getPrompt('CHAPTER_SUMMARIZER'))
          const summaryClean = cleanJsonResponse(summaryRaw)
          const summaryMatch = summaryClean.match(/\{[\s\S]*\}/s)
          const summaryObj = summaryMatch ? parseJsonSafe(summaryMatch[0], {}) as any : {}
          if (summaryObj?.denseSummary) {
            updatePayload.denseSummary = summaryObj.denseSummary
          }
        } catch (err) {
          console.warn('Dense summary generation failed', err)
        }
        projectStore.updateChapter(chapter.id, updatePayload)
        updateContextMetadata(chapter.id)
      }
    }

    showBatchModal.value = false
    overwriteExisting.value = false
  } catch (e) {
    console.error(e)
    alert('Failed to batch generate chapters')
  } finally {
    isBatchGenerating.value = false
    batchProgress.value = ''
    gepaStage.value = null
  }
}




async function generateChapterWithGEPA(chapterPrompt: string): Promise<string> {
  // Stage 1: Generate initial draft
  gepaStage.value = 'draft'
  const draft = await generateText(chapterPrompt, '', 'outline', promptStore.getPrompt('CHAPTER_WRITER_HIERARCHICAL'))
  if (!draft) throw new Error('Failed to generate initial draft')

  // Stage 2: Reflect on the draft
  gepaStage.value = 'reflect'
  const reflectPrompt = `CHAPTER SYNOPSIS:\n${chapterPrompt}\n\nDRAFT TO REVIEW:\n${draft}`
  const reflectionRaw = await generateText(reflectPrompt, '', 'outline', promptStore.getPrompt('GEPA_CHAPTER_REFLECT'))
  
  // Parse reflection JSON
  let reflection: { strengths: string[]; weaknesses: string[]; suggestions: string[]; priority_fix: string }
  try {
    const cleaned = cleanJsonResponse(reflectionRaw)
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/s)
    reflection = jsonMatch ? JSON.parse(jsonMatch[0]) : { strengths: [], weaknesses: [], suggestions: [], priority_fix: 'Improve overall quality' }
  } catch {
    reflection = { strengths: [], weaknesses: ['Could not parse feedback'], suggestions: [], priority_fix: 'Improve overall quality' }
  }

  // Stage 3: Improve based on reflection
  gepaStage.value = 'improve'
  const improvePrompt = `ORIGINAL SYNOPSIS:\n${chapterPrompt}\n\nDRAFT:\n${draft}\n\nEDITORIAL FEEDBACK:\n- Strengths: ${reflection.strengths.join('; ')}\n- Weaknesses: ${reflection.weaknesses.join('; ')}\n- Suggestions: ${reflection.suggestions.join('; ')}\n- Priority Fix: ${reflection.priority_fix}`
  
  const improved = await generateText(improvePrompt, '', 'outline', promptStore.getPrompt('GEPA_CHAPTER_IMPROVE'))
  
  gepaStage.value = null
  return improved || draft // Fall back to draft if improvement fails
}

async function generateChapterDraft(chapterId: string) {
  const chapter = projectStore.storyOutline.find(c => c.id === chapterId)
  if (!chapter) return

  generatingChapterId.value = chapterId
  gepaStage.value = null
  
  try {
    // Ensure previous chapter has a dense summary for rolling context
    const idx = projectStore.storyOutline.findIndex(c => c.id === chapterId)
    const prev = idx > 0 ? projectStore.storyOutline[idx - 1] : null
    if (prev && !prev.denseSummary && prev.content) {
      try {
        const prevSummaryPrompt = `Chapter Title: ${prev.title}\n\nFull Chapter:\n${stripHtml(prev.content)}`
        const prevSummaryRaw = await generateText(prevSummaryPrompt, '', 'outline', promptStore.getPrompt('CHAPTER_SUMMARIZER'))
        const prevClean = cleanJsonResponse(prevSummaryRaw)
        const prevMatch = prevClean.match(/\{[\s\S]*\}/s)
        const prevObj = prevMatch ? parseJsonSafe(prevMatch[0], {}) as any : {}
        if (prevObj?.denseSummary) {
          projectStore.updateChapter(prev.id, { denseSummary: prevObj.denseSummary })
        }
      } catch (err) {
        console.warn('Previous chapter summary generation failed', err)
      }
    }

    const chapterPrompt = buildChapterPrompt(chapter)
    let result: string
    
    if (useGEPA.value) {
      result = await generateChapterWithGEPA(chapterPrompt)
    } else {
      result = await generateText(chapterPrompt, '', 'outline', promptStore.getPrompt('CHAPTER_WRITER_HIERARCHICAL'))
    }
    
    if (result) {
      const html = await marked.parse(result)
      const updatePayload: Partial<StoryChapter> = { content: html, draftStatus: 'draft' }
      try {
        const summaryPrompt = `Chapter Title: ${chapter.title}\n\nFull Chapter:\n${stripHtml(html)}`
        const summaryRaw = await generateText(summaryPrompt, '', 'outline', promptStore.getPrompt('CHAPTER_SUMMARIZER'))
        const summaryClean = cleanJsonResponse(summaryRaw)
        const summaryMatch = summaryClean.match(/\{[\s\S]*\}/s)
        const summaryObj = summaryMatch ? parseJsonSafe(summaryMatch[0], {}) as any : {}
        if (summaryObj?.denseSummary) {
          updatePayload.denseSummary = summaryObj.denseSummary
        }
      } catch (err) {
        console.warn('Dense summary generation failed', err)
      }
      projectStore.updateChapter(chapter.id, updatePayload)
      updateContextMetadata(chapter.id)
    }
  } catch (e) {
    console.error(e)
    alert('Failed to generate chapter')
  } finally {
    generatingChapterId.value = null
    gepaStage.value = null
  }
}

async function generateTransition(chapterId: string) {
  const chapter = projectStore.storyOutline.find(c => c.id === chapterId)
  if (!chapter) return

  const index = projectStore.storyOutline.findIndex(c => c.id === chapterId)
  const nextChapter = index < projectStore.storyOutline.length - 1 ? projectStore.storyOutline[index + 1] : null
  if (!nextChapter) {
    alert('No next chapter to transition into.')
    return
  }

  generatingTransitionId.value = chapterId
  try {
    const promptParts = [
      `Current Chapter: ${chapter.title}`,
      `Current Summary: ${stripHtml(chapter.summary || '')}`,
      `Next Chapter: ${nextChapter.title}`,
      `Next Summary: ${stripHtml(nextChapter.summary || '')}`,
      `Goal: Write a short transition hook (1-2 paragraphs) that closes the current chapter and naturally sets up the opening of the next. Keep voice and tone consistent.`
    ]

    const prompt = promptParts.join('\n\n')
    const result = await generateText(prompt, '', 'outline', promptStore.getPrompt('CHAPTER_WRITER'))
    if (result) {
      const html = await marked.parse(result)
      const existingSummary = chapter.summary || ''
      const transitionBlock = `<p><strong>Transition to "${nextChapter.title}":</strong></p>${html}`
      projectStore.updateChapter(chapter.id, { summary: existingSummary + transitionBlock })
    }
  } catch (e) {
    console.error(e)
    alert('Failed to generate transition')
  } finally {
    generatingTransitionId.value = null
  }
}

function handleDeleteChapter(chapterId: string) {
  if (confirm('Are you sure you want to delete this chapter? This cannot be undone.')) {
    projectStore.deleteChapter(chapterId)
  }
}

function toggleSelectMode() {
  isSelectMode.value = !isSelectMode.value
  if (!isSelectMode.value) {
    selectedChapterIds.value.clear()
  }
}

function toggleChapterSelection(chapterId: string) {
  if (selectedChapterIds.value.has(chapterId)) {
    selectedChapterIds.value.delete(chapterId)
  } else {
    selectedChapterIds.value.add(chapterId)
  }
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedChapterIds.value.clear()
  } else {
    projectStore.storyOutline.forEach(c => selectedChapterIds.value.add(c.id))
  }
}

function deleteSelected() {
  const count = selectedChapterIds.value.size
  if (count === 0) return
  if (confirm(`Are you sure you want to delete ${count} chapter${count > 1 ? 's' : ''}? This cannot be undone.`)) {
    selectedChapterIds.value.forEach(id => projectStore.deleteChapter(id))
    selectedChapterIds.value.clear()
    isSelectMode.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col relative">
    
    <!-- Top Toolbar -->
    <div class="flex justify-between items-end mb-6 px-1">
      <div class="flex items-center gap-3">
        <div class="text-sm text-base-content/50 font-bold uppercase tracking-wide">
          Timeline
        </div>
        <button 
          v-if="projectStore.storyOutline.length > 0"
          @click="toggleSelectMode" 
          class="btn btn-ghost btn-xs"
          :class="isSelectMode ? 'btn-active' : ''"
        >
          <CheckSquare class="w-4 h-4" />
          Select
        </button>
      </div>
      <div class="flex gap-2">
        <!-- Select Mode Actions -->
        <template v-if="isSelectMode">
          <button @click="toggleSelectAll" class="btn btn-ghost btn-sm">
            <component :is="allSelected ? CheckSquare : Square" class="w-4 h-4 mr-2" />
            {{ allSelected ? 'Deselect All' : 'Select All' }}
          </button>
          <button 
            @click="deleteSelected" 
            class="btn btn-error btn-sm"
            :disabled="!someSelected"
          >
            <Trash2 class="w-4 h-4 mr-2" />
            Delete ({{ selectedChapterIds.size }})
          </button>
        </template>
        <!-- Normal Actions -->
        <template v-else>
          <button @click="showGenerateModal = true" class="btn btn-ghost btn-sm text-primary">
            <Wand2 class="w-4 h-4 mr-2" />
            Generate
          </button>
          <button @click="showBatchModal = true" class="btn btn-ghost btn-sm text-secondary">
            <Sparkles class="w-4 h-4 mr-2" />
            Batch Chapters
          </button>
          <button @click="startAdd()" class="btn btn-primary btn-sm shadow-sm">
            <Plus class="w-4 h-4 mr-2" />
            Add Chapter
          </button>
        </template>
      </div>
    </div>

    <!-- Timeline / List -->
    <div class="space-y-4 pb-20 relative">
       <!-- Vertical Line (Timeline spine) -->
       <div v-if="projectStore.storyOutline.length > 0" class="absolute left-8 top-4 bottom-4 w-0.5 bg-base-200 -z-10 hidden md:block"></div>

       <!-- New Chapter Editor (Top Position) -->
       <div v-if="editingId === 'NEW' && insertIndex === undefined" class="animate-in fade-in slide-in-from-top-2 duration-300 mb-8">
         <ChapterEditor 
           v-model="editForm" 
           :is-new="true"
           @save="saveEdit" 
           @cancel="cancelEdit"
         />
       </div>

       <!-- Chapter List -->
       <div 
         v-for="(chapter, index) in projectStore.storyOutline" 
         :key="chapter.id"
       >
         <!-- Insert Zone -->
         <div v-if="!editingId && !isSelectMode" class="group relative h-4 -my-2 z-10 flex items-center justify-center hover:my-2 transition-all duration-200">
            <div class="w-full h-0.5 bg-primary/0 group-hover:bg-primary/20 transition-colors"></div>
            <button 
               @click="startAdd(index)"
               class="absolute btn btn-xs btn-circle btn-primary shadow-sm scale-0 group-hover:scale-100 opacity-0 group-hover:opacity-100 transition-all duration-200"
               title="Insert Chapter Here"
            >
               <Plus class="w-3 h-3" />
            </button>
         </div>

         <!-- New Chapter Editor (Inserted Position) -->
         <div v-if="editingId === 'NEW' && insertIndex === index" class="animate-in fade-in slide-in-from-top-2 duration-300 my-4">
           <div class="flex items-center gap-2 mb-2 text-primary font-bold text-xs uppercase tracking-wider px-2">
              <Plus class="w-3 h-3" />
              Inserting Chapter {{ index + 1 }}
           </div>
           <ChapterEditor 
             v-model="editForm" 
             :is-new="true"
             @save="saveEdit" 
             @cancel="cancelEdit"
           />
         </div>

         <!-- Editing this specific chapter -->
         <div v-if="editingId === chapter.id" class="animate-in fade-in zoom-in-95 duration-200">
            <ChapterEditor 
              v-model="editForm" 
              @save="saveEdit" 
              @cancel="cancelEdit"
            />
         </div>

         <!-- Viewing this chapter -->
         <ChapterItem 
           v-else
           :chapter="chapter" 
           :index="index" 
           :total-chapters="projectStore.storyOutline.length"
           :is-generating="generatingChapterId === chapter.id"
           :is-generating-transition="generatingTransitionId === chapter.id"
           :is-select-mode="isSelectMode"
           :is-selected="selectedChapterIds.has(chapter.id)"
           @edit="startEdit"
           @generate="generateChapterDraft"
           @transition="generateTransition"
           @delete="handleDeleteChapter"
           @toggle-select="toggleChapterSelection"
         />
       </div>

       <!-- Empty State -->
       <div v-if="projectStore.storyOutline.length === 0 && editingId !== 'NEW'" class="text-center py-20 opacity-50 border-2 border-dashed border-base-200 rounded-xl">
         <p class="mb-4">Your story timeline is empty.</p>
         <button @click="startAdd()" class="btn btn-sm btn-ghost">Start writing</button>
       </div>
    </div>

    <!-- Generate Modal -->
    <div v-if="showGenerateModal" class="modal modal-open backdrop-blur-md z-50">
      <div class="modal-box shadow-2xl border border-base-200 max-w-2xl p-0 overflow-hidden bg-base-100">
        <!-- Header -->
        <div class="bg-gradient-to-r from-primary/10 via-base-100 to-base-100 p-6 border-b border-base-200">
          <div class="flex items-center gap-3 mb-2">
            <div class="p-2 rounded-lg bg-primary/10 text-primary">
              <Wand2 class="w-6 h-6" />
            </div>
            <div>
              <h3 class="font-black text-xl">Story Architect</h3>
              <p class="text-xs font-medium text-base-content/50 uppercase tracking-wider">AI Outline Generator</p>
            </div>
          </div>
          <p class="text-sm text-base-content/70 pl-14">Transform a simple premise into a structured chapter-by-chapter outline.</p>
        </div>

        <div class="p-6 space-y-5">
          <!-- Premise with Improve Button -->
          <div class="form-control">
            <div class="flex justify-between items-center mb-2">
              <label class="label-text font-bold text-sm uppercase tracking-wide opacity-60">Story Premise</label>
              <button 
                @click="improvePrompt" 
                class="btn btn-ghost btn-xs gap-1.5 hover:bg-primary/10 hover:text-primary transition-colors"
                :disabled="isImprovingPrompt || !outlineForm.premise.trim()"
                title="AI will rewrite your premise to be more detailed and dramatic"
              >
                <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isImprovingPrompt }" />
                {{ isImprovingPrompt ? 'Enhancing...' : 'Enhance Premise' }}
              </button>
            </div>
            <div class="relative">
              <textarea 
                v-model="outlineForm.premise" 
                class="textarea textarea-bordered w-full h-36 text-sm leading-relaxed focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none p-4" 
                placeholder="Start with your core idea: 'A cyberpunk detective in Neo-Tokyo investigates a rogue AI that claims to have a soul...'"
                :disabled="isImprovingPrompt"
              ></textarea>
              <div v-if="isImprovingPrompt" class="absolute inset-0 bg-base-100/50 backdrop-blur-[1px] flex items-center justify-center rounded-lg">
                <div class="flex flex-col items-center gap-2">
                  <span class="loading loading-dots loading-md text-primary"></span>
                  <span class="text-xs font-medium text-primary">Adding detail & conflict...</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Settings Grid -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5 p-4 bg-base-200/30 rounded-xl border border-base-200/50">
            <!-- Genre -->
            <div class="form-control">
              <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-1.5">Genre</label>
              <input 
                v-model="outlineForm.genre" 
                type="text" 
                class="input input-bordered input-sm w-full" 
                placeholder="Sci-fi thriller, Fantasy romance..."
              />
            </div>

            <!-- Audience Age -->
            <div class="form-control">
              <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-1.5">Audience Age</label>
              <select v-model="outlineForm.ageGroup" class="select select-bordered select-sm w-full">
                <option value="">General / Adult</option>
                <option value="Adult">Adult</option>
                <option value="Young Adult (13-18)">Young Adult (13-18)</option>
                <option value="Middle Grade (8-12)">Middle Grade (8-12)</option>
                <option value="Chapter Book (6-9)">Chapter Book (6-9)</option>
              </select>
            </div>
            
            <!-- Tone -->
            <div class="form-control">
              <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-1.5">Tone & Style</label>
              <input 
                v-model="outlineForm.tone" 
                type="text" 
                class="input input-bordered input-sm w-full" 
                placeholder="Dark and gritty, Whimsical..."
              />
            </div>

            <!-- Chapter Count -->
            <div class="form-control md:col-span-3">
              <div class="flex justify-between items-center mb-2">
                <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60">Length</label>
                <span class="badge badge-sm badge-neutral font-mono">{{ outlineForm.chapterCount }} Chapters</span>
              </div>
              <input 
                v-model.number="outlineForm.chapterCount" 
                type="range" 
                min="3" 
                max="30" 
                step="1"
                class="range range-primary range-xs"
              />
              <div class="flex justify-between text-[10px] font-medium text-base-content/40 px-1 mt-1.5 uppercase tracking-wider">
                <span>Short Story (3)</span>
                <span>Novella (15)</span>
                <span>Novel (30)</span>
              </div>
            </div>
          </div>

          <!-- What to Generate -->
          <div class="border-t border-base-200 pt-5">
            <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-3 block">Generate</label>
            <div class="flex flex-wrap gap-3">
              <label 
                class="flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all"
                :class="outlineForm.generateChapters 
                  ? 'bg-primary/10 border-primary/30 text-primary' 
                  : 'bg-base-200/50 border-base-200 hover:border-primary/30'"
              >
                <input type="checkbox" v-model="outlineForm.generateChapters" class="checkbox checkbox-sm checkbox-primary" />
                <BookOpen class="w-4 h-4" />
                <span class="font-medium text-sm">Chapters</span>
              </label>
              
              <label 
                class="flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all"
                :class="outlineForm.generateCharacters 
                  ? 'bg-secondary/10 border-secondary/30 text-secondary' 
                  : 'bg-base-200/50 border-base-200 hover:border-secondary/30'"
              >
                <input type="checkbox" v-model="outlineForm.generateCharacters" class="checkbox checkbox-sm checkbox-secondary" />
                <Users class="w-4 h-4" />
                <span class="font-medium text-sm">Characters</span>
              </label>
              
              <label 
                class="flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all"
                :class="outlineForm.generateTerminology 
                  ? 'bg-accent/10 border-accent/30 text-accent' 
                  : 'bg-base-200/50 border-base-200 hover:border-accent/30'"
              >
                <input type="checkbox" v-model="outlineForm.generateTerminology" class="checkbox checkbox-sm checkbox-accent" />
                <Tag class="w-4 h-4" />
                <span class="font-medium text-sm">Terminology</span>
              </label>
            </div>
            <p class="text-[11px] text-base-content/50 mt-2">Select what elements to auto-generate from your premise.</p>
          </div>
        </div>
        
        <!-- Footer Actions -->
        <div class="modal-action bg-base-200/50 p-4 m-0 flex justify-between items-center border-t border-base-200">
          <div class="text-xs text-base-content/50">
            <span v-if="outlineForm.generateChapters || outlineForm.generateCharacters || outlineForm.generateTerminology">
              Will create: 
              <span v-if="outlineForm.generateChapters" class="text-primary font-medium">chapters</span>
              <span v-if="outlineForm.generateChapters && (outlineForm.generateCharacters || outlineForm.generateTerminology)">, </span>
              <span v-if="outlineForm.generateCharacters" class="text-secondary font-medium">characters</span>
              <span v-if="outlineForm.generateCharacters && outlineForm.generateTerminology">, </span>
              <span v-if="outlineForm.generateTerminology" class="text-accent font-medium">terms</span>
            </span>
          </div>
          <div class="flex gap-2">
            <button @click="showGenerateModal = false; resetOutlineForm()" class="btn btn-ghost btn-sm" :disabled="isGenerating">Cancel</button>
            <button 
              @click="generateOutline" 
              class="btn btn-primary btn-sm px-6 gap-2 shadow-lg shadow-primary/20" 
              :disabled="isGenerating || !outlineForm.premise.trim() || (!outlineForm.generateChapters && !outlineForm.generateCharacters && !outlineForm.generateTerminology)"
            >
              <span v-if="isGenerating" class="loading loading-spinner loading-xs"></span>
              <Wand2 v-else class="w-4 h-4" />
              {{ isGenerating ? 'Architecting...' : 'Generate' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Batch Generate Chapters Modal -->
    <div v-if="showBatchModal" class="modal modal-open backdrop-blur-sm z-50">
      <div class="modal-box shadow-2xl border border-base-200 max-w-xl">
        <h3 class="font-bold text-lg mb-2 flex items-center gap-2">
          <Sparkles class="w-5 h-5 text-secondary" />
          Batch Generate Chapters
        </h3>
        <p class="text-sm text-base-content/70 mb-4">
          Draft full chapters for each outline entry using its summary and tagged characters.
        </p>

        <!-- GEPA Toggle -->
        <div class="p-4 rounded-xl bg-base-200/50 border border-base-200 mb-4">
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" class="checkbox checkbox-secondary mt-0.5" v-model="useGEPA" :disabled="isBatchGenerating">
            <div>
              <span class="font-bold text-sm flex items-center gap-2">
                GEPA: Reflective Evolution
                <span class="badge badge-xs badge-secondary">Better Quality</span>
              </span>
              <p class="text-xs text-base-content/60 mt-1">
                Each chapter goes through 3 stages: Draft → Reflect → Improve. Takes ~3x longer but produces higher quality prose.
              </p>
            </div>
          </label>
        </div>

        <div class="form-control mb-4">
          <label class="label cursor-pointer justify-start gap-3">
            <input type="checkbox" class="checkbox" v-model="overwriteExisting" :disabled="isBatchGenerating">
            <span class="label-text">Overwrite chapters that already have content</span>
          </label>
        </div>

        <!-- Progress Display -->
        <div v-if="batchProgress" class="mb-4">
          <div class="flex items-center gap-3 p-3 rounded-lg bg-info/10 border border-info/20">
            <span class="loading loading-spinner loading-sm text-info"></span>
            <div class="flex-1">
              <p class="text-sm font-medium">{{ batchProgress }}</p>
              <div v-if="useGEPA && gepaStage" class="flex gap-2 mt-2">
                <span class="badge badge-xs" :class="gepaStage === 'draft' ? 'badge-info' : 'badge-ghost'">Draft</span>
                <span class="badge badge-xs" :class="gepaStage === 'reflect' ? 'badge-warning' : 'badge-ghost'">Reflect</span>
                <span class="badge badge-xs" :class="gepaStage === 'improve' ? 'badge-success' : 'badge-ghost'">Improve</span>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-action">
          <button @click="showBatchModal = false" class="btn btn-ghost" :disabled="isBatchGenerating">Cancel</button>
          <button @click="batchGenerateChapters" class="btn btn-secondary px-6" :disabled="isBatchGenerating">
            <span v-if="isBatchGenerating" class="loading loading-spinner loading-xs mr-2"></span>
            {{ isBatchGenerating ? 'Generating...' : 'Generate Chapters' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
