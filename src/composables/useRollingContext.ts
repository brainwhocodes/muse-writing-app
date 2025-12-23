import { useProjectStore, type StoryChapter } from '../stores/project'
import { useChapterContext } from './useChapterContext'
import { stripHtml } from './useTextUtils'

/**
 * Lightweight rolling context helper: builds context snapshots,
 * estimates token usage, and flags when prompts are stale.
 */
export function useRollingContext() {
  const projectStore = useProjectStore()
  const { formatStoryBible } = useChapterContext()

  function estimateTokens(text: string): number {
    // Rough heuristic: 4 chars per token for planning purposes
    return Math.ceil(text.length / 4)
  }

  function hashString(text: string): string {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i)
      hash |= 0
    }
    return hash.toString()
  }

  /**
   * Build the ordered user blocks used for chapter generation.
   * Consumers can join with separators to form the final prompt.
   */
  function buildChapterBlocks(chapter: StoryChapter): string[] {
    const index = projectStore.storyOutline.findIndex(c => c.id === chapter.id)
    const prevChapter = index > 0 ? projectStore.storyOutline[index - 1] : null

    const prevSummary = prevChapter?.denseSummary || prevChapter?.summary || ''

    return [
      formatStoryBible(),
      `Previous Dense Summary:\n${stripHtml(prevSummary || '')}`,
      chapter.placeholder ? `Placeholder:\n${stripHtml(chapter.placeholder)}` : '',
      chapter.validatorNotes ? `Validator Notes:\n${stripHtml(chapter.validatorNotes)}` : '',
      `Current Chapter Synopsis:\n${stripHtml(chapter.summary || '')}`
    ].filter(Boolean)
  }

  /**
   * Compute and persist context metadata on a chapter:
   * - contextSnapshot: concatenated blocks
   * - lastPromptHash: hash of the snapshot
   * - contextTokens: estimated token cost
   */
  function updateContextMetadata(chapterId: string) {
    const chapter = projectStore.storyOutline.find(c => c.id === chapterId)
    if (!chapter) return
    const blocks = buildChapterBlocks(chapter)
    const snapshot = blocks.join('\n\n---\n\n')
    projectStore.updateChapter(chapterId, {
      contextSnapshot: snapshot,
      lastPromptHash: hashString(snapshot),
      contextTokens: estimateTokens(snapshot)
    })
  }

  /**
   * Return true if the chapter's stored hash differs from the latest snapshot.
   */
  function needsRefresh(chapter: StoryChapter): boolean {
    const blocks = buildChapterBlocks(chapter)
    const snapshot = blocks.join('\n\n---\n\n')
    const hash = hashString(snapshot)
    return chapter.lastPromptHash !== hash
  }

  return {
    buildChapterBlocks,
    updateContextMetadata,
    needsRefresh
  }
}
