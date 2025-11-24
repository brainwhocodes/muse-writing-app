<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore, type StoryTerm } from '../stores/project'
import { Tag, BookOpenCheck, Trash2, Pencil, Plus } from 'lucide-vue-next'

const projectStore = useProjectStore()

const editingId = ref<string | null>(null)
const form = ref<Partial<StoryTerm>>({
  term: '',
  definition: '',
  notes: '',
  chapters: []
})

const chapters = computed(() => projectStore.storyOutline)
const sortedTerms = computed(() => [...projectStore.terminology].sort((a, b) => a.term.localeCompare(b.term)))

function resetForm() {
  form.value = { term: '', definition: '', notes: '', chapters: [] }
  editingId.value = null
}

function startEdit(term: StoryTerm) {
  editingId.value = term.id
  form.value = { ...term, chapters: [...(term.chapters || [])] }
}

function saveTerm() {
  if (!form.value.term || !form.value.definition) return

  if (editingId.value) {
    projectStore.updateTerm(editingId.value, { ...form.value, chapters: form.value.chapters || [] })
  } else {
    projectStore.addTerm({
      term: form.value.term,
      definition: form.value.definition,
      notes: form.value.notes || '',
      chapters: form.value.chapters || []
    })
  }

  resetForm()
}

function deleteTerm(id: string) {
  projectStore.deleteTerm(id)
  if (editingId.value === id) resetForm()
}
</script>

<template>
  <div class="space-y-7">
    <div class="relative overflow-hidden rounded-3xl border border-base-200/70 bg-gradient-to-r from-primary/20 via-base-100 to-base-100 p-7 shadow-xl">
      <div class="pointer-events-none absolute -left-10 top-0 h-44 w-44 rounded-full bg-primary/15 blur-3xl"></div>
      <div class="pointer-events-none absolute right-4 -bottom-10 h-36 w-36 rounded-full bg-secondary/10 blur-3xl"></div>
      <div class="flex flex-wrap items-start justify-between gap-6">
        <div class="space-y-3">
          <div class="inline-flex items-center gap-2 rounded-full border border-base-200 bg-base-100/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            <Tag class="h-3 w-3" />
            Terminology Studio
          </div>
          <div class="space-y-1">
            <h3 class="text-3xl font-black leading-tight">Give every key term a crisp, intentional feel</h3>
            <p class="max-w-3xl text-sm text-base-content/70">
              Set the canonical phrasing, where it belongs, and how it should sound. Use this to keep tone aligned across chapters and drafts.
            </p>
          </div>
          <div class="flex flex-wrap gap-3 text-xs text-base-content/70">
            <span class="rounded-full border border-base-200/60 bg-base-100/80 px-3 py-1 shadow-sm">
              Lexicon: {{ sortedTerms.length || 0 }} entries
            </span>
            <span class="rounded-full border border-base-200/60 bg-base-100/80 px-3 py-1 shadow-sm">
              Chapters linked: {{ chapters.length }}
            </span>
            <span class="rounded-full border border-base-200/60 bg-base-100/80 px-3 py-1 shadow-sm">
              Prompt: write it how characters would say it, then add the vibe
            </span>
          </div>
        </div>
        <div class="flex flex-col items-end gap-3">
          <button @click="resetForm" class="btn btn-primary btn-sm gap-2 shadow-lg">
            <Plus class="w-4 h-4" />
            New Entry
          </button>
          <p class="max-w-xs text-right text-[12px] text-base-content/60">
            Quick prompt: who says this, what emotion should it trigger, and what should never be mixed with it?
          </p>
        </div>
      </div>
    </div>

    <div class="card bg-base-100/80 backdrop-blur border border-base-200/80 shadow-xl">
      <div class="card-body space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-primary">Language brief</p>
            <h4 class="text-xl font-black">Craft the canonical entry before it spreads through the story</h4>
          </div>
          <span v-if="editingId" class="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Editing existing entry
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-control">
            <label class="label text-xs font-bold uppercase opacity-60">
              Canonical Term
              <span class="ml-2 text-[11px] font-normal text-base-content/50">(exact phrasing that should echo)</span>
            </label>
            <input
              v-model="form.term"
              type="text"
              class="input input-bordered input-primary shadow-sm"
              placeholder="The Shimmer / The Pact / Doctrine of Lights"
            />
            <p class="mt-1 text-xs text-base-content/60">Prompt: keep it short, repeatable, and true to how a character would utter it out loud.</p>
          </div>

          <div class="form-control">
            <label class="label text-xs font-bold uppercase opacity-60">
              Linked Chapters
              <span class="ml-2 text-[11px] font-normal text-base-content/50">(where it shows up or anchors the theme)</span>
            </label>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="chapter in chapters"
                :key="chapter.id"
                class="badge badge-outline gap-2 cursor-pointer border-base-200/70 bg-base-100/80 px-3 py-2 text-sm shadow-sm hover:border-primary hover:bg-primary/5"
              >
                <input
                  type="checkbox"
                  class="checkbox checkbox-xs"
                  v-model="form.chapters"
                  :value="chapter.id"
                />
                <span class="truncate max-w-[160px]">{{ chapter.title }}</span>
              </label>
              <span v-if="chapters.length === 0" class="text-sm text-base-content/50">Add chapters first to link terminology.</span>
            </div>
          </div>
        </div>

        <div class="form-control">
          <label class="label text-xs font-bold uppercase opacity-60">
            Definition
            <span class="ml-2 text-[11px] font-normal text-base-content/50">(what it is, the stakes, and the sensation)</span>
          </label>
          <textarea
            v-model="form.definition"
            class="textarea textarea-bordered textarea-primary min-h-[130px] shadow-sm"
            placeholder="One confident line. Example: A shimmering border between worlds that hums like glass—crossing it erases what you refuse to admit."
          ></textarea>
          <p class="mt-1 text-xs text-base-content/60">Prompt: describe the consequence, the sensory hook, and why characters care right now.</p>
        </div>

        <div class="form-control">
          <label class="label text-xs font-bold uppercase opacity-60">
            Usage / Notes
            <span class="ml-2 text-[11px] font-normal text-base-content/50">(tone, taboo phrasing, visual anchors)</span>
          </label>
          <textarea
            v-model="form.notes"
            class="textarea textarea-bordered min-h-[90px] shadow-sm"
            placeholder="When to invoke it, imagery to echo, lines to avoid, alternate nicknames, or how different characters mispronounce it."
          ></textarea>
          <p class="mt-1 text-xs text-base-content/60">Prompt: note a line you love, a line you never want used, and one visual cue that matches the term.</p>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button v-if="editingId" @click="resetForm" class="btn btn-ghost">Cancel</button>
          <button @click="saveTerm" class="btn btn-primary shadow-md">
            {{ editingId ? 'Update Term' : 'Add to Lexicon' }}
          </button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="term in sortedTerms"
        :key="term.id"
        class="group relative overflow-hidden rounded-2xl border border-base-200/80 bg-base-100/90 shadow-md transition-all duration-200 hover:-translate-y-[2px] hover:shadow-xl"
      >
        <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/70 via-secondary/70 to-primary/40"></div>
        <div class="card-body space-y-4">
          <div class="flex justify-between items-start gap-2">
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <div class="rounded-full bg-primary/10 p-2 text-primary ring-1 ring-primary/15">
                  <Tag class="w-4 h-4" />
                </div>
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-base-content/50">Term</p>
                  <h4 class="font-bold text-lg leading-tight">{{ term.term }}</h4>
                </div>
              </div>
              <p class="text-sm text-base-content/80">{{ term.definition }}</p>
            </div>
            <div class="flex gap-1">
              <button @click="startEdit(term)" class="btn btn-ghost btn-square btn-xs" title="Edit">
                <Pencil class="w-4 h-4" />
              </button>
              <button @click="deleteTerm(term.id)" class="btn btn-ghost btn-square btn-xs" title="Delete">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div v-if="term.notes" class="text-xs text-base-content/80 bg-base-200/60 rounded-lg p-3 border border-base-300/70">
            <span class="block text-[11px] uppercase tracking-wide text-base-content/50 mb-1">Usage cues</span>
            {{ term.notes }}
          </div>

          <div class="flex flex-wrap gap-2 items-center text-xs">
            <span class="inline-flex items-center gap-2 rounded-full bg-base-200/70 px-3 py-1 text-base-content/70">
              <BookOpenCheck class="w-4 h-4 text-base-content/60" />
              Linked Chapters
            </span>
            <span
              v-for="cid in term.chapters || []"
              :key="cid"
              class="badge badge-ghost border border-base-300 bg-base-100/80"
            >
              {{ chapters.find(c => c.id === cid)?.title || 'Unknown' }}
            </span>
            <span v-if="!term.chapters || term.chapters.length === 0" class="text-xs text-base-content/50">None yet</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
