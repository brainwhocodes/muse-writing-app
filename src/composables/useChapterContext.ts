import { useProjectStore, type StoryChapter } from '../stores/project'
import { stripHtml } from './useTextUtils'

/**
 * Composable for building chapter context for AI prompts
 */
export function useChapterContext() {
  const projectStore = useProjectStore()

  /**
   * Builds a comprehensive prompt context for a chapter including
   * book metadata, surrounding chapters, characters, and terminology
   */
  function buildChapterPrompt(chapter: StoryChapter): string {
    const plainLogline = stripHtml(projectStore.bookMetadata.logline || '')
    const plainSynopsis = stripHtml(projectStore.bookMetadata.synopsis || '')

    const index = projectStore.storyOutline.findIndex(c => c.id === chapter.id)
    const prevChapter = index > 0 ? projectStore.storyOutline[index - 1] : null
    const nextChapter = index < projectStore.storyOutline.length - 1 ? projectStore.storyOutline[index + 1] : null

    const prevSummary = prevChapter ? stripHtml(prevChapter.summary || '') : ''
    const nextSummary = nextChapter ? stripHtml(nextChapter.summary || '') : ''

    const characterDetails = (chapter.characters || [])
      .map(id => projectStore.characterOutline.find(char => char.id === id))
      .filter(Boolean)
      .map(char => `${char!.name} (${char!.role}): ${stripHtml(char!.bio)}`)
      .join('\n')

    const termContext = projectStore.terminology
      .filter(t => !t.chapters || t.chapters.length === 0 || t.chapters.includes(chapter.id))
      .map(t => `${t.term}: ${t.definition}${t.notes ? ` (${t.notes})` : ''}`)
      .join('\n')

    const parts = [
      plainLogline ? `Book Logline: ${plainLogline}` : '',
      plainSynopsis ? `Book Synopsis: ${plainSynopsis}` : '',
      `Chapter Title: ${chapter.title}`,
      `Chapter Synopsis: ${stripHtml(chapter.summary || '')}`,
      characterDetails ? `Characters in this chapter:\n${characterDetails}` : '',
      prevSummary ? `Previous Chapter Summary: ${prevSummary}` : '',
      nextSummary ? `Next Chapter Summary: ${nextSummary}` : '',
      termContext ? `Terminology to honor:\n${termContext}` : '',
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

    const characterDetails = projectStore.characterOutline
      .map(c => `${c.name} (${c.role}): ${c.traits}`)
      .join('\n')

    const termContext = projectStore.terminology
      .map(t => `${t.term}: ${t.definition}`)
      .join('\n')

    const parts = [
      plainLogline ? `Book Logline: ${plainLogline}` : '',
      plainSynopsis ? `Book Synopsis: ${plainSynopsis}` : '',
      characterDetails ? `Characters:\n${characterDetails}` : '',
      termContext ? `Terminology:\n${termContext}` : '',
      prevChapter ? `PREVIOUS CHAPTER ("${prevChapter.title}"):\n${stripHtml(prevChapter.content || prevChapter.summary || '')}` : 'This is the FIRST chapter.',
      `CURRENT CHAPTER ("${chapter.title}") - This is the text to improve:\n${chapter.content || ''}`,
      nextChapter ? `NEXT CHAPTER ("${nextChapter.title}") Synopsis:\n${stripHtml(nextChapter.summary || '')}` : 'This is the LAST chapter.',
    ].filter(Boolean)

    return parts.join('\n\n---\n\n')
  }

  return {
    buildChapterPrompt,
    buildEditSystemPrompt,
    buildContinuityPrompt
  }
}
