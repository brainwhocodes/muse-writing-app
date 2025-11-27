/**
 * Text utility functions for HTML/Markdown handling
 */

/**
 * Strips HTML tags from a string and returns plain text
 */
export function stripHtml(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

/**
 * Checks if a string contains HTML tags
 */
export function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content)
}

/**
 * Checks if content contains unconverted markdown syntax
 */
export function hasMarkdownSyntax(content: string): boolean {
  if (!content) return false
  // Check for common markdown patterns that should have been converted
  const markdownPatterns = [
    /\*\*[^*]+\*\*/,        // **bold**
    /\*[^*]+\*/,            // *italic*
    /__[^_]+__/,            // __bold__
    /_[^_]+_/,              // _italic_
    /^#{1,6}\s/m,           // # headers
    /^\s*[-*+]\s/m,         // - list items
    /^\s*\d+\.\s/m,         // 1. numbered lists
    /\[([^\]]+)\]\([^)]+\)/ // [links](url)
  ]
  return markdownPatterns.some(pattern => pattern.test(content))
}

/**
 * Determines if content is HTML or Markdown
 */
export function getContentType(value: string | undefined | null): 'html' | 'markdown' {
  if (!value || value.trim().length === 0) return 'html'
  return isHtml(value) ? 'html' : 'markdown'
}

/**
 * Cleans mixed HTML/Markdown content by converting remaining markdown to HTML
 * Handles content that has both HTML tags and unconverted markdown syntax
 * Uses string replacement to avoid DOM manipulation issues with Vue/TipTap
 */
export function cleanMixedContent(content: string): string {
  if (!content) return ''
  if (!hasMarkdownSyntax(content)) return content
  
  // Use regex-based replacement that's safe for HTML content
  // Process in order: bold first (** and __), then italic (* and _)
  let result = content
    // Bold: **text** or __text__ (but not inside HTML tags)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_ (but not inside HTML tags or attributes)
    .replace(/(?<![<\w])\*([^*<>]+)\*(?![>\w])/g, '<em>$1</em>')
    .replace(/(?<![<\w])_([^_<>]+)_(?![>\w])/g, '<em>$1</em>')
  
  return result
}

/**
 * Splits HTML content into an array of block element strings (outerHTML).
 * Useful for preserving structure when modifying only parts of the content.
 */
export function getHtmlBlocks(html: string): string[] {
  if (!html) return []
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  
  // If no children (just text?), wrap in p
  if (tmp.children.length === 0) {
     const text = tmp.textContent || ''
     if (text.trim()) return [`<p>${tmp.innerHTML}</p>`]
     return []
  }
  
  return Array.from(tmp.children).map(el => el.outerHTML)
}
