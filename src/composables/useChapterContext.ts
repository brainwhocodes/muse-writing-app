import { useProjectStore, type StoryChapter, type Character } from '../stores/project'
import { stripHtml } from './useTextUtils'
import { generateText } from '../services/ai'

/**
 * Composable for building chapter context for AI prompts
 */
export function useChapterContext() {
  const projectStore = useProjectStore()

  function getLengthGuidance(genre: string, ageGroup: string): string {
    const normalizedGenre = genre.toLowerCase()
    const normalizedAge = ageGroup.toLowerCase()
    if (normalizedAge.includes('chapter book')) {
      return 'Chapter Book (6-9): 800-1,800 words, 1-2 beats total.'
    }
    if (normalizedAge.includes('middle grade')) {
      return 'Middle Grade (8-12): 1,200-2,500 words, 1-2 beats per scene.'
    }
    if (normalizedAge.includes('young adult')) {
      return 'Young Adult: 1,500-3,000 words, 2-4 beats total.'
    }
    if (normalizedGenre.includes('sci')) {
      return 'Science fiction: 1,800-3,500 words, 2-4 scenes, keep exposition under 30%.'
    }
    return 'General fiction: 1,500-3,000 words, 2-3 scenes, 2-4 beats total.'
  }

  function formatStoryBible(): string {
    const bible = projectStore.storyBible
    if (!bible) return ''
    const blocks = [
      bible.coreThemes ? `CoreThemes: ${stripHtml(bible.coreThemes)}` : '',
      bible.characterTerminologies ? `CharacterTerminologies: ${stripHtml(bible.characterTerminologies)}` : '',
      bible.toneGuidelines ? `ToneGuidelines: ${stripHtml(bible.toneGuidelines)}` : '',
      bible.narrativeArc ? `NarrativeArc: ${stripHtml(bible.narrativeArc)}` : '',
      bible.motifs ? `Motifs: ${stripHtml(bible.motifs)}` : '',
      bible.worldRules ? `WorldRules: ${stripHtml(bible.worldRules)}` : ''
    ].filter(Boolean)
    return blocks.length ? `Story Bible:\n${blocks.join('\n')}` : ''
  }

  /**
   * Formats detailed character info including voice for POV characters
   */
  function formatCharacterForChapter(char: Character, isPovForChapter: boolean): string {
    const lines = [`**${char.name}** (${char.role}): ${stripHtml(char.bio)}`]
    if (char.traits) {
      lines.push(`  Traits: ${char.traits}`)
    }
    if (isPovForChapter || char.isPov) {
      if (char.voiceDiction) {
        lines.push(`  Voice/Diction: ${char.voiceDiction}`)
      }
      if (char.voiceForbidden) {
        lines.push(`  FORBIDDEN phrases for this character: ${char.voiceForbidden}`)
      }
      if (char.voiceMetaphors) {
        lines.push(`  Signature metaphors/phrases: ${char.voiceMetaphors}`)
      }
    }
    return lines.join('\n')
  }

  /**
   * Builds a comprehensive prompt context for a chapter including
   * book metadata, surrounding chapters, characters, and terminology
   */
  function buildChapterPrompt(chapter: StoryChapter): string {
    const plainLogline = stripHtml(projectStore.bookMetadata.logline || '')
    const plainSynopsis = stripHtml(projectStore.bookMetadata.synopsis || '')
    const ageGroup = projectStore.bookMetadata.ageGroup || ''
    const lengthGuidance = getLengthGuidance(projectStore.bookMetadata.genre || '', ageGroup)
    const index = projectStore.storyOutline.findIndex(c => c.id === chapter.id)
    const prevChapter = index > 0 ? projectStore.storyOutline[index - 1] : null
    const nextChapter = index < projectStore.storyOutline.length - 1 ? projectStore.storyOutline[index + 1] : null
    const prevSummary = prevChapter ? stripHtml(prevChapter.denseSummary || prevChapter.summary || '') : ''
    const prevDense = prevChapter?.denseSummary ? stripHtml(prevChapter.denseSummary) : ''
    const nextSummary = nextChapter ? stripHtml(nextChapter.summary || '') : ''
    const chapterCharacters = (chapter.characters || [])
      .map(id => projectStore.characterOutline.find(char => char.id === id))
      .filter(Boolean) as Character[]
    const povCharacter = chapterCharacters.find(c => c.isPov) || chapterCharacters[0]
    const characterDetails = chapterCharacters
      .map(char => formatCharacterForChapter(char, char.id === povCharacter?.id))
      .join('\n\n')
    const relevantTerms = projectStore.terminology
      .filter(t => !t.chapters || t.chapters.length === 0 || t.chapters.includes(chapter.id))
    const termContext = relevantTerms
      .map(t => `- **${t.term}**: ${t.definition}${t.notes ? ` (Usage: ${t.notes})` : ''}`)
      .join('\n')
    const termUsageInstruction = relevantTerms.length > 0
      ? `\n\n⚠️ TERMINOLOGY REQUIREMENT: You MUST use the following terms naturally in this chapter where appropriate. Do not invent alternatives—use these exact canonical terms:\n${relevantTerms.map(t => `• "${t.term}"`).join('\n')}`
      : ''
    const parts = [
      plainLogline ? `Book Logline: ${plainLogline}` : '',
      plainSynopsis ? `Book Synopsis: ${plainSynopsis}` : '',
      ageGroup ? `Audience Age Group: ${ageGroup}` : '',
      lengthGuidance ? `Length Guidance: ${lengthGuidance}` : '',
      formatStoryBible(),
      `Chapter Title: ${chapter.title}`,
      `Chapter Synopsis: ${stripHtml(chapter.summary || '')}`,
      chapter.placeholder ? `Placeholder: ${stripHtml(chapter.placeholder)}` : '',
      chapter.validatorNotes ? `Validator Notes: ${stripHtml(chapter.validatorNotes)}` : '',
      characterDetails ? `Characters in this chapter:\n${characterDetails}` : '',
      prevSummary ? `Previous Chapter Summary: ${prevSummary}` : '',
      prevDense ? `Previous Dense Summary: ${prevDense}` : '',
      nextSummary ? `Next Chapter Summary: ${nextSummary}` : '',
      termContext ? `World Terminology:\n${termContext}${termUsageInstruction}` : '',
      `Guidance: Maintain continuity with the previous chapter and set up the next chapter naturally.`
    ].filter(Boolean)
    return parts.join('\n\n')
  }

  /**
   * Builds a system prompt for editing with full book context
   */
  function buildEditSystemPrompt(currentChapter: StoryChapter | null): string {
    const plainLogline = stripHtml(projectStore.bookMetadata.logline || '')
    const plainSynopsis = stripHtml(projectStore.bookMetadata.synopsis || '')
    const ageGroup = projectStore.bookMetadata.ageGroup || ''
    const lengthGuidance = getLengthGuidance(projectStore.bookMetadata.genre || '', ageGroup)

    const outlineContext = projectStore.storyOutline
      .map(ch => `${ch.title}: ${stripHtml(ch.summary || '')}`)
      .join('\n')

    const termContext = projectStore.terminology
      .map(term => `${term.term}: ${term.definition}${term.notes ? ` | Usage: ${term.notes}` : ''}`)
      .join('\n')

    const chapterContext = currentChapter
      ? `Current Chapter: ${currentChapter.title}\nSynopsis: ${stripHtml(currentChapter.summary || '')}`
      : ''

    return [
      'You are the novel\'s line editor. Keep tone, voice, and continuity steady while editing the user-selected passage.',
      plainLogline ? `Book Logline: ${plainLogline}` : '',
      plainSynopsis ? `Book Synopsis: ${plainSynopsis}` : '',
      ageGroup ? `Audience Age Group: ${ageGroup}` : '',
      lengthGuidance ? `Length Guidance: ${lengthGuidance}` : '',
      formatStoryBible(),
      outlineContext ? `Outline (all chapters):\n${outlineContext}` : '',
      chapterContext,
      termContext ? `Terminology (canonical phrasing to preserve):\n${termContext}` : '',
      'Honor existing names/terms, avoid inventing new canon, and maintain emotional throughlines set by surrounding chapters.'
    ].filter(Boolean).join('\n\n')
  }

  /**
   * Builds a prompt for continuity checking a chapter
   */
  function buildContinuityPrompt(chapterIndex: number): string {
    const chapter = projectStore.storyOutline[chapterIndex]
    const prevChapter = chapterIndex > 0 ? projectStore.storyOutline[chapterIndex - 1] : null
    const nextChapter = chapterIndex < projectStore.storyOutline.length - 1 ? projectStore.storyOutline[chapterIndex + 1] : null

    const plainLogline = stripHtml(projectStore.bookMetadata.logline || '')
    const plainSynopsis = stripHtml(projectStore.bookMetadata.synopsis || '')
    const ageGroup = projectStore.bookMetadata.ageGroup || ''
    const lengthGuidance = getLengthGuidance(projectStore.bookMetadata.genre || '', ageGroup)

    const characterDetails = projectStore.characterOutline
      .map(c => `${c.name} (${c.role}): ${c.traits}`)
      .join('\n')

    const termContext = projectStore.terminology
      .map(t => `${t.term}: ${t.definition}`)
      .join('\n')

    const parts = [
      plainLogline ? `Book Logline: ${plainLogline}` : '',
      plainSynopsis ? `Book Synopsis: ${plainSynopsis}` : '',
      ageGroup ? `Audience Age Group: ${ageGroup}` : '',
      lengthGuidance ? `Length Guidance: ${lengthGuidance}` : '',
      characterDetails ? `Characters:\n${characterDetails}` : '',
      termContext ? `Terminology:\n${termContext}` : '',
      prevChapter ? `PREVIOUS CHAPTER ("${prevChapter.title}"):\n${stripHtml(prevChapter.content || prevChapter.summary || '')}` : 'This is the FIRST chapter.',
      `CURRENT CHAPTER ("${chapter.title}") - This is the text to improve:\n${chapter.content || ''}`,
      nextChapter ? `NEXT CHAPTER ("${nextChapter.title}") Synopsis:\n${stripHtml(nextChapter.summary || '')}` : 'This is the LAST chapter.',
    ].filter(Boolean)

    return parts.join('\n\n---\n\n')
  }

  /**
   * Extracts new terminology and character mentions from chapter content
   * Returns suggestions for terms/characters that appear but aren't defined
   */
  async function extractFromChapter(chapterId: string): Promise<{
    suggestedTerms: Array<{ term: string; definition: string; category: string }>
    characterMentions: Array<{ name: string; context: string }>
  }> {
    const chapter = projectStore.storyOutline.find(c => c.id === chapterId)
    if (!chapter?.content) {
      return { suggestedTerms: [], characterMentions: [] }
    }
    const chapterText = stripHtml(chapter.content)
    const existingTerms = projectStore.terminology.map(t => t.term.toLowerCase())
    const existingCharacters = projectStore.characterOutline.map(c => c.name.toLowerCase())
    const extractPrompt = `Analyze this chapter and extract world-building elements:

CHAPTER CONTENT:
${chapterText.substring(0, 8000)}

EXISTING TERMINOLOGY (do NOT include these):
${existingTerms.join(', ') || 'None'}

EXISTING CHARACTERS (do NOT include these):
${existingCharacters.join(', ') || 'None'}

TASK: Find NEW terms and character mentions that should be added to the story bible.

OUTPUT FORMAT (JSON only):
{
  "suggestedTerms": [{"term": "Name", "definition": "Brief definition", "category": "place|object|concept|event|other"}],
  "characterMentions": [{"name": "Character Name", "context": "How they appear in this chapter"}]
}

Only include genuinely new, story-specific terms (not common words). Output JSON only.`
    try {
      const result = await generateText(extractPrompt, '', 'outline')
      const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/s)
      if (match) {
        const parsed = JSON.parse(match[0])
        return {
          suggestedTerms: parsed.suggestedTerms || [],
          characterMentions: parsed.characterMentions || []
        }
      }
    } catch (err) {
      console.error('Extraction failed:', err)
    }
    return { suggestedTerms: [], characterMentions: [] }
  }

  /**
   * Builds context for generating terminology that aligns with chapter needs
   */
  function buildTerminologyContext(): string {
    const meta = projectStore.bookMetadata
    const chapters = projectStore.storyOutline
    const existingTerms = projectStore.terminology
    const chapterSummaries = chapters.slice(0, 10).map((c, i) => 
      `Chapter ${i + 1} - ${c.title}: ${stripHtml(c.summary || 'No summary')}`
    ).join('\n')
    const existingTermsList = existingTerms.length > 0
      ? existingTerms.map(t => `- ${t.term} (${t.category || 'other'}): ${t.definition}`).join('\n')
      : 'None yet'
    return `BOOK: ${meta.title || 'Untitled'}
GENRE: ${meta.genre || 'Fiction'}
AUDIENCE: ${meta.ageGroup || 'General'}
LOGLINE: ${meta.logline || 'No logline'}
SYNOPSIS: ${meta.synopsis || 'No synopsis'}

CHAPTER SUMMARIES:
${chapterSummaries || 'No chapters yet'}

EXISTING TERMINOLOGY:
${existingTermsList}

Generate terminology that would naturally appear in these chapters and enhance the world-building.`
  }

  /**
   * Builds context for generating characters that fit the story
   */
  function buildCharacterContext(): string {
    const meta = projectStore.bookMetadata
    const chapters = projectStore.storyOutline
    const existingChars = projectStore.characterOutline
    const chapterSummaries = chapters.slice(0, 10).map((c, i) => 
      `Chapter ${i + 1} - ${c.title}: ${stripHtml(c.summary || 'No summary')}`
    ).join('\n')
    const existingCharList = existingChars.length > 0
      ? existingChars.map(c => `- ${c.name} (${c.role}): ${c.traits}`).join('\n')
      : 'None yet'
    return `BOOK: ${meta.title || 'Untitled'}
GENRE: ${meta.genre || 'Fiction'}
AUDIENCE: ${meta.ageGroup || 'General'}
LOGLINE: ${meta.logline || 'No logline'}
SYNOPSIS: ${meta.synopsis || 'No synopsis'}

CHAPTER SUMMARIES:
${chapterSummaries || 'No chapters yet'}

EXISTING CHARACTERS:
${existingCharList}

Generate characters that would naturally appear in these chapters and drive the narrative.`
  }

  return {
    formatStoryBible,
    formatCharacterForChapter,
    buildChapterPrompt,
    buildEditSystemPrompt,
    buildContinuityPrompt,
    extractFromChapter,
    buildTerminologyContext,
    buildCharacterContext
  }
}
