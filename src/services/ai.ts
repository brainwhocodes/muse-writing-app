import OpenAI from 'openai'
import { useSettingsStore } from '../stores/settings'
import { useProjectStore } from '../stores/project'

export async function generateText(
  prompt: string, 
  selectedText: string, 
  contextMode: 'paragraph' | 'selection' | 'outline' = 'selection',
  customSystemPrompt?: string
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

  let userMessage = ''
  
  if (contextMode === 'paragraph') {
    userMessage = `Regenerate the following paragraph based on this instruction: "${prompt}"\n\nPARAGRAPH:\n${selectedText}`
  } else if (contextMode === 'selection') {
    userMessage = `Edit or continue the following text based on this instruction: "${prompt}"\n\nTEXT:\n${selectedText}`
  } else if (contextMode === 'outline') {
    userMessage = prompt
  }

  try {
    const response = await client.chat.completions.create({
      model: settings.selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
    })

    return response.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('AI Generation Error:', error)
    throw error
  }
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
  
  const systemPrompt = customSystemPrompt || `You are a creative writing assistant. Context: ${characterContext}`

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
