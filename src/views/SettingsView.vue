<script setup lang="ts">
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()
</script>

<template>
  <div class="p-4 max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Settings</h1>
    
    <div class="form-control w-full mb-4">
      <label class="label">
        <span class="label-text">OpenRouter API Key</span>
      </label>
      <input 
        :value="settingsStore.openRouterKey"
        @input="(e) => settingsStore.setApiKey((e.target as HTMLInputElement).value)"
        type="password" 
        placeholder="sk-or-..." 
        class="input input-bordered w-full" 
      />
      <label class="label">
        <span class="label-text-alt">Required for AI features</span>
      </label>
    </div>

    <div class="form-control w-full mb-4">
      <label class="label">
        <span class="label-text">Preferred Model</span>
      </label>
      <select 
        :value="settingsStore.selectedModel"
        @change="(e) => settingsStore.setModel((e.target as HTMLSelectElement).value)"
        class="select select-bordered"
      >
        <option value="moonshotai/kimi-linear-48b-a3b-instruct">Kimi K2 Linear Instruct</option>

        <option value="moonshotai/kimi-k2-thinking" selected>Kimi K2 Thinking</option>
        <option value="google/gemini-3-pro-preview">Gemini 3 Pro Preview</option>
        <option value="anthropic/claude-3-opus">Claude 3 Opus</option>
        <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet</option>
        <option value="meta-llama/llama-3-70b-instruct">Llama 3 70B</option>
        <option value="openai/gpt-4-turbo">GPT-4 Turbo</option>
        <option value="mistralai/mistral-large">Mistral Large</option>
      </select>
    </div>

    <div class="form-control w-full mb-4">
      <label class="label">
        <span class="label-text">Default Prompt</span>
      </label>
      <input 
        :value="settingsStore.defaultPrompt"
        @input="(e) => settingsStore.setPrompt((e.target as HTMLInputElement).value)"
        type="text" 
        class="input input-bordered w-full" 
      />
    </div>
  </div>
</template>
