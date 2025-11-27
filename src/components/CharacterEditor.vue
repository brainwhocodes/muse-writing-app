<script setup lang="ts">
import { ref } from 'vue'
import { type Character } from '../stores/project'
import { generateText } from '../services/ai'
import { AI_PROMPTS } from '../constants/prompts'
import { Wand2, Sparkles, Mic, AlertTriangle, Quote } from 'lucide-vue-next'
import RichTextEditor from './RichTextEditor.vue'
import { marked } from 'marked'

const props = defineProps<{
  modelValue: Partial<Character>
  isNew?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Partial<Character>): void
  (e: 'save'): void
  (e: 'cancel'): void
}>()

const isFleshingOut = ref(false)
const isSuggestingTraits = ref(false)

function updateField(field: keyof Character, value: any) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

function stripHtml(html: string) {
  const tmp = document.createElement("DIV")
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ""
}

async function fleshOutBio() {
  if (!props.modelValue.name) return
  isFleshingOut.value = true
  try {
    const plainBio = stripHtml(props.modelValue.bio || '')
    const context = `Character Name: ${props.modelValue.name}\nRole: ${props.modelValue.role}\nCurrent Bio: ${plainBio || 'None'}`
    const systemPrompt = AI_PROMPTS.CHARACTER_DEVELOPER
    const userPrompt = `Flesh out the biography for this character. Keep it concise but interesting (under 150 words).`
    
    const result = await generateText(userPrompt + '\n' + context, '', 'outline', systemPrompt)
    updateField('bio', await marked.parse(result))
  } catch (e) {
    console.error(e)
  } finally {
    isFleshingOut.value = false
  }
}

async function suggestTraits() {
  if (!props.modelValue.bio && !props.modelValue.role) return
  isSuggestingTraits.value = true
  try {
    const plainBio = stripHtml(props.modelValue.bio || '')
    const context = `Character Name: ${props.modelValue.name}\nRole: ${props.modelValue.role}\nBio: ${plainBio}`
    const systemPrompt = `You are a character expert. Suggest 5 distinct personality traits as a comma-separated list.`
    
    const result = await generateText(context, '', 'outline', systemPrompt)
    updateField('traits', result)
  } catch (e) {
    console.error(e)
  } finally {
    isSuggestingTraits.value = false
  }
}
</script>

<template>
  <div class="card bg-base-100 border border-base-100 shadow-2xl w-full max-w-2xl mx-auto overflow-visible relative group">
    <!-- Gradient Accent -->
    <div class="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-primary via-secondary to-accent rounded-t-xl"></div>
    
    <!-- Close Button -->
    <button @click="$emit('cancel')" class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 z-10 text-base-content/50 hover:bg-base-200">✕</button>

    <div class="card-body p-0">
      
      <!-- Header Profile Section -->
      <div class="bg-base-200/30 p-8 pb-6 flex flex-col sm:flex-row gap-6 items-center sm:items-start border-b border-base-200">
        
        <!-- Avatar Circle -->
        <div class="avatar ring ring-base-100 ring-offset-2 ring-offset-base-200 rounded-full shadow-sm">
          <div class="w-24 h-24 rounded-full overflow-hidden">
            <img src="../assets/character-avatar.svg" alt="Character Avatar" class="w-full h-full object-cover" />
          </div>
        </div>

        <!-- Identity Inputs -->
        <div class="flex-1 w-full text-center sm:text-left space-y-2">
          <div class="form-control w-full">
             <input 
              :value="modelValue.name"
              @input="updateField('name', ($event.target as HTMLInputElement).value)"
              type="text" 
              class="input input-ghost w-full text-3xl md:text-4xl font-bold placeholder:text-base-content/20 px-0 h-auto text-center sm:text-left focus:bg-transparent" 
              placeholder="Character Name"
              autofocus
            />
          </div>
          
          <div class="flex justify-center sm:justify-start">
            <select 
              :value="modelValue.role"
              @change="updateField('role', ($event.target as HTMLSelectElement).value)"
              class="select select-sm select-ghost font-bold uppercase tracking-wide text-xs opacity-60 focus:bg-base-200"
            >
              <option value="" disabled selected>Select Role</option>
              <option value="Protagonist">Protagonist</option>
              <option value="Antagonist">Antagonist</option>
              <option value="Deuteragonist">Sidekick / Deuteragonist</option>
              <option value="Love Interest">Love Interest</option>
              <option value="Mentor">Mentor</option>
              <option value="Supporting">Supporting</option>
              <option value="Minor">Minor</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Content Section -->
      <div class="p-6 md:p-8 space-y-6">

        <!-- Bio Section -->
        <div class="form-control group/bio">
          <label class="label font-bold text-xs uppercase opacity-50 flex justify-between items-center">
            <span>Biography & Backstory</span>
            <button 
              @click="fleshOutBio"
              class="btn btn-xs btn-ghost text-primary gap-1 opacity-0 group-hover/bio:opacity-100 transition-opacity"
              :disabled="isFleshingOut || !modelValue.name"
            >
              <Wand2 v-if="!isFleshingOut" class="w-3 h-3" />
              <span v-else class="loading loading-spinner loading-xs"></span>
              Flesh Out
            </button>
          </label>
          <RichTextEditor 
            :modelValue="modelValue.bio || ''"
            @update:modelValue="updateField('bio', $event)"
            class="min-h-[8rem]"
            placeholder="Write their story. What drives them? What is their past?"
          />
        </div>

        <div class="divider my-0"></div>

        <!-- Traits Section -->
        <div class="form-control group/traits">
          <label class="label font-bold text-xs uppercase opacity-50 flex justify-between items-center">
            <span>Personality Traits</span>
            <button 
              @click="suggestTraits"
              class="btn btn-xs btn-ghost text-secondary gap-1 opacity-0 group-hover/traits:opacity-100 transition-opacity"
              :disabled="isSuggestingTraits || (!modelValue.bio && !modelValue.role)"
            >
              <Sparkles v-if="!isSuggestingTraits" class="w-3 h-3" />
              <span v-else class="loading loading-spinner loading-xs"></span>
              Suggest
            </button>
          </label>
          
          <input 
            :value="modelValue.traits"
            @input="updateField('traits', ($event.target as HTMLInputElement).value)"
            type="text" 
            class="input input-ghost px-0 -ml-1 w-full font-medium" 
            placeholder="e.g. Brave, Stubborn, Intelligent" 
          />
          
          <!-- Visual Tags Preview -->
          <div class="flex flex-wrap gap-2 mt-2" v-if="modelValue.traits">
            <span 
              v-for="(trait, i) in modelValue.traits.split(',').filter(t => t.trim())" 
              :key="i"
              class="badge badge-neutral gap-1 pl-2 pr-2 py-3"
            >
              {{ trait.trim() }}
            </span>
          </div>
        </div>

        <div class="divider my-0"></div>

        <!-- Voice Section -->
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <Mic class="w-4 h-4 text-primary" />
            <h3 class="font-bold text-sm">Voice & Diction</h3>
            <label class="label cursor-pointer gap-2 ml-auto">
              <span class="label-text text-xs opacity-60">POV Character</span>
              <input 
                type="checkbox" 
                class="toggle toggle-primary toggle-sm" 
                :checked="modelValue.isPov"
                @change="updateField('isPov', ($event.target as HTMLInputElement).checked)"
              />
            </label>
          </div>
          
          <p class="text-xs text-base-content/60 -mt-2">
            Define this character's unique voice for consistency when writing from their POV.
          </p>

          <!-- Diction Rules -->
          <div class="form-control">
            <label class="label py-1">
              <span class="label-text text-xs font-medium opacity-70">Diction Rules</span>
            </label>
            <textarea 
              :value="modelValue.voiceDiction || ''"
              @input="updateField('voiceDiction', ($event.target as HTMLTextAreaElement).value)"
              class="textarea textarea-bordered textarea-sm h-20 text-sm leading-relaxed" 
              placeholder="e.g. Uses short, clipped sentences. Prefers Anglo-Saxon words over Latin roots. Never uses contractions when angry."
            ></textarea>
          </div>

          <!-- Forbidden Phrases -->
          <div class="form-control">
            <label class="label py-1">
              <span class="label-text text-xs font-medium opacity-70 flex items-center gap-1">
                <AlertTriangle class="w-3 h-3 text-warning" />
                Forbidden Words/Phrases
              </span>
            </label>
            <textarea 
              :value="modelValue.voiceForbidden || ''"
              @input="updateField('voiceForbidden', ($event.target as HTMLTextAreaElement).value)"
              class="textarea textarea-bordered textarea-sm h-16 text-sm leading-relaxed" 
              placeholder="e.g. 'awesome', 'literally', modern slang, passive voice"
            ></textarea>
          </div>

          <!-- Signature Metaphors -->
          <div class="form-control">
            <label class="label py-1">
              <span class="label-text text-xs font-medium opacity-70 flex items-center gap-1">
                <Quote class="w-3 h-3 text-secondary" />
                Signature Metaphors & Phrases
              </span>
            </label>
            <textarea 
              :value="modelValue.voiceMetaphors || ''"
              @input="updateField('voiceMetaphors', ($event.target as HTMLTextAreaElement).value)"
              class="textarea textarea-bordered textarea-sm h-16 text-sm leading-relaxed" 
              placeholder="e.g. Compares things to machinery. Uses nautical terms. Favorite saying: 'The river always finds the sea.'"
            ></textarea>
          </div>
        </div>

        <div class="modal-action pt-2 border-t border-base-200 mt-8">
          <button @click="$emit('cancel')" class="btn btn-ghost">Cancel</button>
          <button @click="$emit('save')" class="btn btn-primary px-8 shadow-lg shadow-primary/20">Save Profile</button>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.input-ghost:focus, .textarea-ghost:focus {
  background-color: transparent;
  box-shadow: none;
  outline: none;
}
</style>
