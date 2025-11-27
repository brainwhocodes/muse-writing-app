import OpenAI from 'openai'
import { useSettingsStore } from '../stores/settings'
import { useProjectStore } from '../stores/project'

const ENGLISH_ENFORCEMENT = `
CRITICAL LANGUAGE REQUIREMENT: You MUST write ONLY in English. 
- Use only English words and Latin alphabet characters
- Do NOT use Chinese, Japanese, Korean, Cyrillic, Arabic, or any non-Latin scripts
- If you find yourself generating non-English text, stop and rewrite in English
`

/**
 * Detects if text contains significant non-English characters
 * Returns true if non-English content is detected
 */
function containsNonEnglish(text: string): boolean {
  console.log('Checking for non-English:', text)
  // Match CJK characters, Cyrillic, Arabic, Thai, etc.
  const nonLatinPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f\uac00-\ud7af]/
  const matches = text.match(nonLatinPattern)
  // Allow small amounts (might be in names/terms) but flag if substantial
  return matches !== null && matches.length > 5
}

export async function generateText(
  prompt: string, 
  selectedText: string, 
  contextMode: 'paragraph' | 'selection' | 'outline' = 'selection',
  customSystemPrompt?: string,
  maxRetries: number = 2
): Promise<string> {
  const settings = useSettingsStore()
  const project = useProjectStore()

  if (!settings.openRouterKey) {
    throw new Error('OpenRouter API Key is missing. Please check settings.')
  }

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: settings.openRouterKey,
    dangerouslyAllowBrowser: true // Since we are in Electron/Client-side app
  })

  // Build context from outline and characters
  const characterContext = project.characterOutline.map(c => `${c.name} (${c.role}): ${c.traits}`).join('\n')
  const storyContext = project.storyOutline.map(c => `${c.title}: ${c.summary}`).join('\n')
  
  let systemPrompt = customSystemPrompt
  
  if (!systemPrompt) {
    systemPrompt = `You are a creative writing assistant. 
    
    STORY CONTEXT:
    ${storyContext}
    
    CHARACTERS:
    ${characterContext}
    
    Your goal is to assist the user in writing their book. 
    Maintain the tone and style consistent with the story.
    `
  }
  
  // Prepend English enforcement to all system prompts
  systemPrompt = ENGLISH_ENFORCEMENT + '\n\n' + systemPrompt

  let userMessage = ''
  
  if (contextMode === 'paragraph') {
    userMessage = `Regenerate the following paragraph based on this instruction: "${prompt}"\n\nPARAGRAPH:\n${selectedText}`
  } else if (contextMode === 'selection') {
    userMessage = `Edit or continue the following text based on this instruction: "${prompt}"\n\nTEXT:\n${selectedText}`
  } else if (contextMode === 'outline') {
    userMessage = prompt
  }

  let lastResult = ''
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const isRetry = attempt > 0
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: isRetry 
          ? `${userMessage}\n\nIMPORTANT: Your previous response contained non-English characters. Please respond ONLY in English using Latin alphabet.`
          : userMessage 
        }
      ]
      
      const response = await client.chat.completions.create({
        model: settings.selectedModel,
        messages,
      })

      const result = response.choices[0]?.message?.content || ''
      lastResult = result
      
      // Check for non-English content
      if (containsNonEnglish(result)) {
        console.warn(`Attempt ${attempt + 1}: Non-English characters detected, retrying...`)
        if (attempt < maxRetries) continue
      }
      
      return result
    } catch (error) {
      console.error('AI Generation Error:', error)
      throw error
    }
  }
  
  // Return last result even if it had non-English (better than nothing)
  console.warn('Max retries reached, returning last result despite non-English content')
  return lastResult
}

export async function* streamText(
  prompt: string, 
  contextMode: 'outline' | 'general',
  customSystemPrompt?: string
): AsyncGenerator<string> {
  const settings = useSettingsStore()
  const project = useProjectStore()

  if (!settings.openRouterKey) {
    throw new Error('OpenRouter API Key is missing')
  }

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: settings.openRouterKey,
    dangerouslyAllowBrowser: true
  })

  // Simplified context build for streaming to avoid huge prompts
  const characterContext = project.characterOutline.map(c => `${c.name} (${c.role})`).join(', ')
  
  const basePrompt = customSystemPrompt || `You are a creative writing assistant. Context: ${characterContext}`
  const systemPrompt = ENGLISH_ENFORCEMENT + '\n\n' + basePrompt

  const stream = await client.chat.completions.create({
    model: settings.selectedModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    stream: true
  })

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || ''
    if (content) yield content
  }
}
