<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore, type StoryTerm } from '../stores/project'
import { Tag, BookOpenCheck, Trash2, Pencil, Plus, Search, Copy, MapPin, Box, Lightbulb, Users, Calendar, HelpCircle, FileText, Sparkles, RefreshCw, Wand2, FileSearch } from 'lucide-vue-next'
import { stripHtml } from '../composables/useTextUtils'
import { useGepa, GEPA_DIMENSIONS } from '../composables/useGepa'
import { generateText } from '../services/ai'
import { useChapterContext } from '../composables/useChapterContext'

const projectStore = useProjectStore()
const { optimize: gepaOptimize, progress: gepaProgress } = useGepa()
const { extractFromChapter } = useChapterContext()

const editingId = ref<string | null>(null)
const isRegenerating = ref(false)
const regenerateStatus = ref('')
const searchQuery = ref('')
const categoryFilter = ref<string>('all')
const showForm = ref(false)
const form = ref<Partial<StoryTerm>>({
  term: '',
  definition: '',
  notes: '',
  chapters: [],
  category: 'other',
  aliases: ''
})

const categories = [
  { value: 'place', label: 'Place', icon: MapPin },
  { value: 'object', label: 'Object', icon: Box },
  { value: 'concept', label: 'Concept', icon: Lightbulb },
  { value: 'character', label: 'Character', icon: Users },
  { value: 'event', label: 'Event', icon: Calendar },
  { value: 'other', label: 'Other', icon: HelpCircle }
] as const

const chapters = computed(() => projectStore.storyOutline)

// Count term occurrences across all chapter content
function countTermUsage(term: StoryTerm): number {
  const searchTerms = [term.term, ...(term.aliases || '').split(',').map(a => a.trim()).filter(Boolean)]
  let count = 0
  for (const chapter of projectStore.storyOutline) {
    const content = stripHtml(chapter.content || '').toLowerCase()
    for (const searchTerm of searchTerms) {
      const regex = new RegExp(searchTerm.toLowerCase(), 'gi')
      const matches = content.match(regex)
      if (matches) count += matches.length
    }
  }
  return count
}

// Find excerpts where term appears
function findTermExcerpts(term: StoryTerm, maxExcerpts: number = 2): Array<{ chapter: string; excerpt: string }> {
  const searchTerms = [term.term, ...(term.aliases || '').split(',').map(a => a.trim()).filter(Boolean)]
  const excerpts: Array<{ chapter: string; excerpt: string }> = []
  for (const chapter of projectStore.storyOutline) {
    if (excerpts.length >= maxExcerpts) break
    const content = stripHtml(chapter.content || '')
    const lowerContent = content.toLowerCase()
    for (const searchTerm of searchTerms) {
      const pos = lowerContent.indexOf(searchTerm.toLowerCase())
      if (pos !== -1) {
        const start = Math.max(0, pos - 30)
        const end = Math.min(content.length, pos + searchTerm.length + 50)
        let excerpt = content.substring(start, end).trim()
        if (start > 0) excerpt = '...' + excerpt
        if (end < content.length) excerpt = excerpt + '...'
        excerpts.push({ chapter: chapter.title, excerpt })
        break
      }
    }
  }
  return excerpts
}

// Filter and sort terms
const filteredTerms = computed(() => {
  let terms = [...projectStore.terminology]
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    terms = terms.filter(t => 
      t.term.toLowerCase().includes(query) || 
      t.definition.toLowerCase().includes(query) ||
      (t.aliases || '').toLowerCase().includes(query)
    )
  }
  if (categoryFilter.value !== 'all') {
    terms = terms.filter(t => t.category === categoryFilter.value)
  }
  return terms.sort((a, b) => a.term.localeCompare(b.term))
})

function resetForm() {
  form.value = { term: '', definition: '', notes: '', chapters: [], category: 'other', aliases: '' }
  editingId.value = null
  showForm.value = false
}

function startAdd() {
  resetForm()
  showForm.value = true
}

function startEdit(term: StoryTerm) {
  editingId.value = term.id
  form.value = { ...term, chapters: [...(term.chapters || [])] }
  showForm.value = true
}

function saveTerm() {
  if (!form.value.term || !form.value.definition) return

  if (editingId.value) {
    projectStore.updateTerm(editingId.value, { 
      ...form.value, 
      chapters: form.value.chapters || [],
      category: form.value.category || 'other',
      aliases: form.value.aliases || ''
    })
  } else {
    projectStore.addTerm({
      term: form.value.term,
      definition: form.value.definition,
      notes: form.value.notes || '',
      chapters: form.value.chapters || [],
      category: form.value.category || 'other',
      aliases: form.value.aliases || ''
    })
  }

  resetForm()
}

function deleteTerm(id: string) {
  if (confirm('Delete this term?')) {
    projectStore.deleteTerm(id)
    if (editingId.value === id) resetForm()
  }
}

function copyTerm(term: string) {
  navigator.clipboard.writeText(term)
}

function getCategoryIcon(category: string) {
  const cat = categories.find(c => c.value === category)
  return cat?.icon || HelpCircle
}

function getCategoryLabel(category: string) {
  const cat = categories.find(c => c.value === category)
  return cat?.label || 'Other'
}

/**
 * Get story context for terminology generation
 */
function getStoryContext(): string {
  const meta = projectStore.bookMetadata
  const chapters = projectStore.storyOutline
  const chapterSummaries = chapters.slice(0, 5).map(c => `- ${c.title}: ${c.summary || 'No summary'}`).join('\n')
  return `BOOK: ${meta.title || 'Untitled'}
GENRE: ${meta.genre || 'Fiction'}
AUDIENCE: ${meta.ageGroup || 'General'}
LOGLINE: ${meta.logline || 'No logline'}
PREMISE: ${meta.synopsis || 'No synopsis provided'}

CHAPTER SUMMARIES:
${chapterSummaries || 'No chapters yet'}`
}

type TermItem = { term: string; definition: string; category?: string }

/**
 * Find best matching existing term for an improved term
 */
function findMatchingTerm(improvedTerm: TermItem, existingTerms: StoryTerm[]): StoryTerm | undefined {
  // Exact match on term name
  const exactMatch = existingTerms.find(t => t.term.toLowerCase() === improvedTerm.term.toLowerCase())
  if (exactMatch) return exactMatch
  // Check if the improved term is a renamed version (similar definition)
  const definitionMatch = existingTerms.find(t => {
    const similarity = calculateSimilarity(t.definition.toLowerCase(), improvedTerm.definition.toLowerCase())
    return similarity > 0.6
  })
  return definitionMatch
}

/**
 * Simple similarity check between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 3))
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 3))
  if (words1.size === 0 || words2.size === 0) return 0
  const intersection = [...words1].filter(w => words2.has(w)).length
  return intersection / Math.max(words1.size, words2.size)
}

/**
 * Improve existing terminology using GEPA - updates in place, preserving metadata
 */
async function improveTerminology() {
  if (projectStore.terminology.length === 0) {
    alert('No terminology to improve. Add some terms first.')
    return
  }
  isRegenerating.value = true
  regenerateStatus.value = 'Analyzing terminology...'
  try {
    const existingTerms = [...projectStore.terminology]
    const currentTerms: TermItem[] = existingTerms.map(t => ({
      term: t.term,
      definition: t.definition,
      category: t.category
    }))
    const result = await gepaOptimize<TermItem[]>(currentTerms, {
      taskName: 'story terminology',
      dimensions: GEPA_DIMENSIONS.terminology,
      context: getStoryContext(),
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
    // Update existing terms in place, preserving notes/aliases/chapters
    let updatedCount = 0
    let addedCount = 0
    const matchedIds = new Set<string>()
    result.improved.forEach((improvedTerm) => {
      const match = findMatchingTerm(improvedTerm, existingTerms.filter(t => !matchedIds.has(t.id)))
      if (match) {
        matchedIds.add(match.id)
        // Update in place - preserve notes, aliases, chapters
        projectStore.updateTerm(match.id, {
          term: improvedTerm.term,
          definition: improvedTerm.definition,
          category: (improvedTerm.category as 'place' | 'object' | 'concept' | 'event' | 'other') || match.category
        })
        updatedCount++
      } else {
        // Genuinely new term from GEPA
        projectStore.addTerm({
          term: improvedTerm.term,
          definition: improvedTerm.definition,
          notes: '',
          chapters: [],
          category: (improvedTerm.category as 'place' | 'object' | 'concept' | 'event' | 'other') || 'other',
          aliases: ''
        })
        addedCount++
      }
    })
    regenerateStatus.value = `Improved ${updatedCount} terms${addedCount > 0 ? `, added ${addedCount} new` : ''}! Score: ${(result.finalScore * 100).toFixed(0)}%`
    setTimeout(() => { regenerateStatus.value = '' }, 3000)
  } catch (err) {
    console.error('Terminology improvement failed:', err)
    regenerateStatus.value = 'Improvement failed'
    setTimeout(() => { regenerateStatus.value = '' }, 3000)
  } finally {
    isRegenerating.value = false
  }
}

/**
 * Generate fresh terminology from story context - adds to existing terms
 */
async function generateTerminology() {
  isRegenerating.value = true
  regenerateStatus.value = 'Generating terminology...'
  try {
    const context = getStoryContext()
    const existingTerms = projectStore.terminology
    const existingTermsList = existingTerms.length > 0
      ? `\n\nEXISTING TERMS (do NOT duplicate these, create NEW different terms):\n${existingTerms.map(t => `- ${t.term}: ${t.definition}`).join('\n')}`
      : ''

    const prompt = `${context}${existingTermsList}

Generate 5-8 unique, evocative terminology entries for this story world.
Focus on terms that:
- Feel specific to THIS story (not generic fantasy/sci-fi terms)
- Evoke the tone and atmosphere
- Would be memorable to readers
- Help define the world's unique identity
- Are DIFFERENT from any existing terms listed above

OUTPUT FORMAT (JSON array):
[{"term": "Unique Name", "definition": "Clear, evocative definition", "category": "place|object|concept|event|other"}]

Output ONLY the JSON array.`

    const response = await generateText(prompt, '', 'outline')
    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const match = cleaned.match(/\[[\s\S]*\]/s)
    if (!match) throw new Error('Could not parse terminology')
    const newTerms: TermItem[] = JSON.parse(match[0])
    
    // Filter out any duplicates with existing terms
    const existingNames = new Set(existingTerms.map(t => t.term.toLowerCase()))
    const filteredNewTerms = newTerms.filter(t => !existingNames.has(t.term.toLowerCase()))
    
    if (filteredNewTerms.length === 0) {
      regenerateStatus.value = 'No new unique terms generated. Try again!'
      setTimeout(() => { regenerateStatus.value = '' }, 3000)
      return
    }
    
    // Run GEPA improvement on the new terms
    regenerateStatus.value = 'Improving new terminology...'
    const result = await gepaOptimize<TermItem[]>(filteredNewTerms, {
      taskName: 'story terminology',
      dimensions: GEPA_DIMENSIONS.terminology,
      context,
      serialize: (terms) => JSON.stringify(terms, null, 2),
      parse: (res) => {
        const c = res.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const m = c.match(/\[[\s\S]*\]/s)
        if (m) return JSON.parse(m[0])
        return JSON.parse(c)
      },
      maxIterations: 2,
      targetScore: 0.8
    })
    
    // Add improved terms, skipping any that somehow became duplicates
    let addedCount = 0
    result.improved.forEach((t) => {
      if (!existingNames.has(t.term.toLowerCase())) {
        projectStore.addTerm({
          term: t.term,
          definition: t.definition,
          notes: '',
          chapters: [],
          category: (t.category as 'place' | 'object' | 'concept' | 'event' | 'other') || 'other',
          aliases: ''
        })
        existingNames.add(t.term.toLowerCase())
        addedCount++
      }
    })
    regenerateStatus.value = `Added ${addedCount} new terms! Score: ${(result.finalScore * 100).toFixed(0)}%`
    setTimeout(() => { regenerateStatus.value = '' }, 3000)
  } catch (err) {
    console.error('Terminology generation failed:', err)
    regenerateStatus.value = 'Generation failed'
    setTimeout(() => { regenerateStatus.value = '' }, 3000)
  } finally {
    isRegenerating.value = false
  }
}

/**
 * Improve a single term using GEPA
 */
async function improveSingleTerm(term: StoryTerm) {
  isRegenerating.value = true
  regenerateStatus.value = `Improving "${term.term}"...`
  try {
    const termItem: TermItem = { term: term.term, definition: term.definition, category: term.category }
    const result = await gepaOptimize<TermItem[]>([termItem], {
      taskName: 'single story term',
      dimensions: GEPA_DIMENSIONS.terminology,
      context: getStoryContext(),
      serialize: (terms) => JSON.stringify(terms, null, 2),
      parse: (response) => {
        const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const match = cleaned.match(/\[[\s\S]*\]/s)
        if (match) return JSON.parse(match[0])
        return JSON.parse(cleaned)
      },
      maxIterations: 1,
      targetScore: 0.85
    })
    if (result.improved.length > 0) {
      const improved = result.improved[0]
      projectStore.updateTerm(term.id, {
        term: improved.term,
        definition: improved.definition,
        category: (improved.category as 'place' | 'object' | 'concept' | 'event' | 'other') || term.category
      })
      regenerateStatus.value = `Improved "${improved.term}"!`
    }
    setTimeout(() => { regenerateStatus.value = '' }, 2000)
  } catch (err) {
    console.error('Single term improvement failed:', err)
    regenerateStatus.value = 'Improvement failed'
    setTimeout(() => { regenerateStatus.value = '' }, 2000)
  } finally {
    isRegenerating.value = false
  }
}

/**
 * Extract terminology from all written chapters
 */
async function extractFromChapters() {
  const chaptersWithContent = projectStore.storyOutline.filter(c => c.content && c.content.length > 100)
  if (chaptersWithContent.length === 0) {
    alert('No chapters with content to extract from. Write some chapters first!')
    return
  }
  isRegenerating.value = true
  regenerateStatus.value = 'Extracting terms from chapters...'
  try {
    let allSuggestedTerms: Array<{ term: string; definition: string; category: string }> = []
    for (let i = 0; i < Math.min(chaptersWithContent.length, 5); i++) {
      const chapter = chaptersWithContent[i]
      regenerateStatus.value = `Scanning ${chapter.title}...`
      const result = await extractFromChapter(chapter.id)
      allSuggestedTerms = [...allSuggestedTerms, ...result.suggestedTerms]
    }
    const existingTermNames = new Set(projectStore.terminology.map(t => t.term.toLowerCase()))
    const uniqueNewTerms = allSuggestedTerms.filter(t => !existingTermNames.has(t.term.toLowerCase()))
    const deduped = uniqueNewTerms.reduce((acc, t) => {
      if (!acc.find(x => x.term.toLowerCase() === t.term.toLowerCase())) {
        acc.push(t)
      }
      return acc
    }, [] as typeof uniqueNewTerms)
    if (deduped.length === 0) {
      regenerateStatus.value = 'No new terms found in chapters.'
      setTimeout(() => { regenerateStatus.value = '' }, 3000)
      return
    }
    let addedCount = 0
    deduped.forEach(t => {
      projectStore.addTerm({
        term: t.term,
        definition: t.definition,
        notes: 'Extracted from chapter content',
        chapters: [],
        category: (t.category as 'place' | 'object' | 'concept' | 'event' | 'other') || 'other',
        aliases: ''
      })
      addedCount++
    })
    regenerateStatus.value = `Extracted ${addedCount} new terms from chapters!`
    setTimeout(() => { regenerateStatus.value = '' }, 3000)
  } catch (err) {
    console.error('Chapter extraction failed:', err)
    regenerateStatus.value = 'Extraction failed'
    setTimeout(() => { regenerateStatus.value = '' }, 3000)
  } finally {
    isRegenerating.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="p-3 rounded-xl bg-primary/10 text-primary">
          <Tag class="w-6 h-6" />
        </div>
        <div>
          <h2 class="text-2xl font-black">Lexicon</h2>
          <p class="text-sm text-base-content/60">
            <span class="font-semibold text-primary">{{ projectStore.terminology.length }}</span> 
            terms in your story's vocabulary
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <!-- AI Generation Buttons -->
        <div class="dropdown dropdown-end">
          <button 
            tabindex="0" 
            class="btn btn-ghost btn-sm gap-2"
            :disabled="isRegenerating"
          >
            <Wand2 class="w-4 h-4" />
            <span v-if="isRegenerating" class="loading loading-spinner loading-xs"></span>
            <span v-else>AI Tools</span>
          </button>
          <ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-50 w-64 p-2 shadow-xl border border-base-200">
            <li>
              <button @click="generateTerminology()" :disabled="isRegenerating" class="flex gap-3">
                <Sparkles class="w-4 h-4 text-primary" />
                <div class="text-left">
                  <div class="font-medium">Generate New</div>
                  <div class="text-xs opacity-60">Create terms from story context</div>
                </div>
              </button>
            </li>
            <li v-if="projectStore.terminology.length > 0">
              <button @click="improveTerminology()" :disabled="isRegenerating" class="flex gap-3">
                <RefreshCw class="w-4 h-4 text-secondary" />
                <div class="text-left">
                  <div class="font-medium">Improve All</div>
                  <div class="text-xs opacity-60">Make terms more unique & thematic</div>
                </div>
              </button>
            </li>
            <li v-if="projectStore.storyOutline.some(c => c.content)">
              <button @click="extractFromChapters()" :disabled="isRegenerating" class="flex gap-3">
                <FileSearch class="w-4 h-4 text-accent" />
                <div class="text-left">
                  <div class="font-medium">Extract from Chapters</div>
                  <div class="text-xs opacity-60">Find terms in written content</div>
                </div>
              </button>
            </li>
          </ul>
        </div>
        <button @click="startAdd()" class="btn btn-primary btn-sm gap-2 shadow-lg shadow-primary/20">
          <Plus class="w-4 h-4" />
          New Term
        </button>
      </div>
    </div>

    <!-- Status Banner -->
    <div v-if="regenerateStatus" class="alert alert-info py-2">
      <Sparkles class="w-4 h-4" />
      <span>{{ regenerateStatus }}</span>
      <span v-if="isRegenerating && gepaProgress.phase !== 'idle'" class="text-xs opacity-70">
        ({{ gepaProgress.phase }})
      </span>
    </div>

    <!-- Search and Filter Bar -->
    <div class="flex flex-wrap gap-3">
      <div class="join flex-1 min-w-64">
        <div class="join-item bg-base-200 flex items-center px-3">
          <Search class="w-4 h-4 opacity-50" />
        </div>
        <input 
          v-model="searchQuery"
          type="text" 
          class="input input-bordered join-item flex-1" 
          placeholder="Search terms, definitions, or aliases..."
        />
      </div>
      <select v-model="categoryFilter" class="select select-bordered">
        <option value="all">All Categories</option>
        <option v-for="cat in categories" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
      </select>
    </div>

    <!-- Editor Form (collapsible) -->
    <div v-if="showForm" class="card bg-base-100 border border-base-200 shadow-xl overflow-hidden">
      <!-- Header -->
      <div class="bg-linear-to-r from-primary/10 via-base-100 to-base-100 p-5 border-b border-base-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-primary/10 text-primary">
              <component :is="getCategoryIcon(form.category || 'other')" class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-black text-lg">{{ editingId ? 'Edit Term' : 'New Lexicon Entry' }}</h3>
              <p class="text-xs text-base-content/50">Define canonical terminology for your story world</p>
            </div>
          </div>
          <button @click="resetForm" class="btn btn-ghost btn-sm btn-circle">✕</button>
        </div>
      </div>

      <div class="p-5 space-y-5">
        <!-- Term & Category Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Term Name - Takes more space -->
          <div class="form-control md:col-span-2">
            <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-1.5">Term Name</label>
            <input 
              v-model="form.term" 
              type="text" 
              class="input input-bordered input-primary focus:ring-2 focus:ring-primary/20" 
              placeholder="The Shimmer, Doctrine of Lights..."
            />
          </div>

          <!-- Category with Icons -->
          <div class="form-control">
            <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-1.5">Category</label>
            <select v-model="form.category" class="select select-bordered w-full">
              <option v-for="cat in categories" :key="cat.value" :value="cat.value">{{ cat.label }}</option>
            </select>
          </div>
        </div>

        <!-- Definition -->
        <div class="form-control">
          <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-1.5">Definition</label>
          <textarea 
            v-model="form.definition" 
            class="textarea textarea-bordered h-28 text-sm leading-relaxed focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none" 
            placeholder="What it is, why it matters, and the feeling it should evoke..."
          ></textarea>
        </div>

        <!-- Aliases & Notes in a grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-base-200/30 rounded-xl border border-base-200/50">
          <!-- Aliases -->
          <div class="form-control">
            <div class="flex justify-between items-center mb-1.5">
              <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60">Aliases</label>
              <span class="text-[10px] text-base-content/40">Comma-separated</span>
            </div>
            <input 
              v-model="form.aliases" 
              type="text" 
              class="input input-bordered input-sm" 
              placeholder="The Veil, Shimmergate..."
            />
          </div>

          <!-- Notes -->
          <div class="form-control">
            <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-1.5">Usage Notes</label>
            <input 
              v-model="form.notes" 
              type="text" 
              class="input input-bordered input-sm" 
              placeholder="Tone, forbidden phrases, cues..."
            />
          </div>
        </div>

        <!-- Linked Chapters -->
        <div v-if="chapters.length > 0" class="form-control">
          <label class="label-text font-bold text-xs uppercase tracking-wide opacity-60 mb-2">Link to Chapters</label>
          <div class="flex flex-wrap gap-2">
            <label 
              v-for="chapter in chapters" 
              :key="chapter.id" 
              class="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all"
              :class="form.chapters?.includes(chapter.id) 
                ? 'bg-primary/10 border-primary/30 text-primary' 
                : 'bg-base-200/50 border-base-200 hover:border-primary/30'"
            >
              <input 
                type="checkbox" 
                class="checkbox checkbox-xs checkbox-primary" 
                v-model="form.chapters" 
                :value="chapter.id"
              />
              <span class="text-xs font-medium">{{ chapter.title }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="flex justify-between items-center p-4 bg-base-200/50 border-t border-base-200">
        <button @click="resetForm" class="btn btn-ghost btn-sm">Cancel</button>
        <button 
          @click="saveTerm" 
          class="btn btn-primary btn-sm px-6 gap-2 shadow-lg shadow-primary/20" 
          :disabled="!form.term || !form.definition"
        >
          <Plus v-if="!editingId" class="w-4 h-4" />
          {{ editingId ? 'Save Changes' : 'Add to Lexicon' }}
        </button>
      </div>
    </div>

    <!-- Terms Grid -->
    <div v-if="filteredTerms.length > 0" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        v-for="term in filteredTerms"
        :key="term.id"
        class="card bg-base-100 border border-base-200 shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="card-body p-4 space-y-3">
          <!-- Header -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-base-200">
                <component :is="getCategoryIcon(term.category || 'other')" class="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 class="font-bold">{{ term.term }}</h4>
                <span class="text-xs text-base-content/50">{{ getCategoryLabel(term.category || 'other') }}</span>
              </div>
            </div>
            <div class="flex gap-1">
              <button 
                @click="improveSingleTerm(term)" 
                class="btn btn-ghost btn-xs btn-square" 
                title="Improve with AI"
                :disabled="isRegenerating"
              >
                <Sparkles class="w-3.5 h-3.5 text-primary" />
              </button>
              <button @click="copyTerm(term.term)" class="btn btn-ghost btn-xs btn-square" title="Copy term">
                <Copy class="w-3.5 h-3.5" />
              </button>
              <button @click="startEdit(term)" class="btn btn-ghost btn-xs btn-square" title="Edit">
                <Pencil class="w-3.5 h-3.5" />
              </button>
              <button @click="deleteTerm(term.id)" class="btn btn-ghost btn-xs btn-square text-error" title="Delete">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Definition -->
          <p class="text-sm text-base-content/80">{{ term.definition }}</p>

          <!-- Aliases -->
          <div v-if="term.aliases" class="flex flex-wrap gap-1">
            <span class="text-xs text-base-content/50">Also:</span>
            <span 
              v-for="(alias, i) in term.aliases.split(',').map(a => a.trim()).filter(Boolean)" 
              :key="i"
              class="badge badge-xs badge-ghost"
            >{{ alias }}</span>
          </div>

          <!-- Usage Stats -->
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <span class="flex items-center gap-1 text-base-content/60">
              <FileText class="w-3 h-3" />
              {{ countTermUsage(term) }} uses
            </span>
            <span v-if="term.chapters?.length" class="flex items-center gap-1 text-base-content/60">
              <BookOpenCheck class="w-3 h-3" />
              {{ term.chapters.length }} chapters
            </span>
          </div>

          <!-- Notes (collapsed) -->
          <div v-if="term.notes" class="text-xs bg-base-200/50 rounded-lg p-2 text-base-content/70">
            {{ term.notes }}
          </div>

          <!-- Excerpts where term appears -->
          <div v-if="findTermExcerpts(term).length > 0" class="border-t border-base-200 pt-2 mt-2">
            <div class="text-[10px] uppercase tracking-wide text-base-content/40 mb-1">Recent usage</div>
            <div v-for="(ex, i) in findTermExcerpts(term)" :key="i" class="text-xs text-base-content/60 italic">
              <span class="font-medium text-primary/70">{{ ex.chapter }}:</span> "{{ ex.excerpt }}"
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="projectStore.terminology.length === 0" class="text-center py-16 border-2 border-dashed border-base-200 rounded-xl">
      <Tag class="w-12 h-12 mx-auto mb-4 text-base-content/20" />
      <h3 class="font-bold text-lg mb-2">No terms yet</h3>
      <p class="text-sm text-base-content/60 mb-4">Build your story's lexicon by adding key terms, places, and concepts.</p>
      <button @click="startAdd" class="btn btn-primary btn-sm">Add First Term</button>
    </div>

    <!-- No Results State -->
    <div v-else class="text-center py-12 text-base-content/50">
      <Search class="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p>No terms match your search.</p>
    </div>
  </div>
</template>
