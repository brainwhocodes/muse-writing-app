<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { BookOpen, Users, Settings, PenTool, Menu, Save, Plus, CheckCircle2, AlertCircle, Trash2 } from 'lucide-vue-next'
import { onMounted, ref, computed } from 'vue'
import { useProjectStore } from './stores/project'

const projectStore = useProjectStore()
const showNewProjectModal = ref(false)
const newProjectName = ref('')
const showDeleteConfirm = ref(false)

const saveStatus = computed(() => {
  if (projectStore.isSaving) return 'Saving...'
  if (projectStore.lastSavedAt) return `Saved ${new Date(projectStore.lastSavedAt).toLocaleTimeString()}`
  return 'Not saved'
})

onMounted(async () => {
  await projectStore.loadProject()
})

async function createProject() {
  projectStore.newProject(newProjectName.value.trim() || 'Untitled Project')
  showNewProjectModal.value = false
  newProjectName.value = ''
  await projectStore.saveProject()
}
</script>

<template>
  <div class="drawer lg:drawer-open bg-base-100 h-screen font-sans">
    <input id="my-drawer-2" type="checkbox" class="drawer-toggle" />
    <div class="drawer-content flex flex-col h-screen overflow-hidden">
      <!-- Navbar for mobile -->
      <div class="w-full navbar bg-base-100 lg:hidden border-b border-base-300">
        <div class="flex-none">
          <label for="my-drawer-2" class="btn btn-square btn-ghost">
            <Menu class="w-6 h-6" />
          </label>
        </div>
        <div class="flex-1 px-2 mx-2 font-bold text-lg">Muse</div>
      </div>
      
      <!-- Page Content -->
      <main class="flex-1 overflow-hidden bg-base-100">
        <RouterView />
      </main>
    </div> 
    
    <!-- Sidebar -->
    <div class="drawer-side z-20">
      <label for="my-drawer-2" aria-label="close sidebar" class="drawer-overlay"></label> 
      <aside class="bg-base-200 w-72 min-h-full flex flex-col border-r border-base-300">
        <!-- App Title/Logo Area -->
        <div class="p-6 flex items-center gap-3">
          <img src="./assets/logo.svg" class="w-10 h-10 shadow-sm rounded-xl" alt="Muse Logo" />
          <span class="text-2xl font-bold tracking-tight text-base-content">Muse</span>
        </div>

        <!-- Navigation -->
        <ul class="menu p-4 w-full gap-2 text-base font-medium flex-1">
          <li class="menu-title opacity-50 uppercase tracking-wider text-xs font-bold mb-1">Project</li>
          
          <li>
            <RouterLink to="/editor" active-class="active bg-primary text-primary-content" class="rounded-lg py-3">
              <PenTool class="w-5 h-5" />
              Write
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/outline" active-class="active bg-primary text-primary-content" class="rounded-lg py-3">
              <BookOpen class="w-5 h-5" />
              Outline
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/characters" active-class="active bg-primary text-primary-content" class="rounded-lg py-3">
              <Users class="w-5 h-5" />
              Characters
            </RouterLink>
          </li>
        </ul>

        <!-- Bottom Settings -->
        <div class="p-4 border-t border-base-300 space-y-2">
          <ul class="menu w-full">
             <li>
               <button @click="showNewProjectModal = true" class="btn btn-outline btn-md w-full justify-start gap-3">
                 <Plus class="w-5 h-5" />
                 <span class="font-semibold">New Project</span>
               </button>
             </li>
             <li>
               <button @click="projectStore.saveProject" class="btn btn-ghost btn-md w-full justify-start gap-3">
                 <Save class="w-5 h-5" />
                 <div class="flex flex-col items-start leading-tight">
                   <span class="font-semibold">Save Project</span>
                   <span class="text-[11px] opacity-60">{{ saveStatus }}</span>
                 </div>
               </button>
             </li>
             <li>
               <button @click="showDeleteConfirm = true" class="btn btn-ghost btn-md w-full justify-start gap-3 text-error">
                 <Trash2 class="w-5 h-5" />
                 <span class="font-semibold">Delete Project</span>
               </button>
             </li>
             <li>
              <RouterLink to="/settings" active-class="active bg-neutral text-neutral-content" class="rounded-lg py-3">
                <Settings class="w-5 h-5" />
                Settings
              </RouterLink>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>

  <!-- Save Status Toast -->
  <div class="toast toast-end z-50" v-if="projectStore.isSaving || projectStore.lastSavedAt || projectStore.loadError">
    <div v-if="projectStore.isSaving" class="alert alert-info shadow-lg">
      <span class="loading loading-spinner loading-sm"></span>
      <span>Saving project...</span>
    </div>
    <div v-else-if="projectStore.loadError" class="alert alert-error shadow-lg">
      <AlertCircle class="w-5 h-5" />
      <span>{{ projectStore.loadError }}</span>
    </div>
    <div v-else class="alert alert-success shadow-lg">
      <CheckCircle2 class="w-5 h-5" />
      <span>Saved at {{ new Date(projectStore.lastSavedAt!).toLocaleTimeString() }}</span>
    </div>
  </div>

  <!-- New Project Modal -->
  <div v-if="showNewProjectModal" class="modal modal-open">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-2 flex items-center gap-2">
        <Plus class="w-5 h-5" />
        Create New Project
      </h3>
      <p class="text-sm text-base-content/70 mb-4">Name your project. This will reset current data after saving.</p>
      <input 
        v-model="newProjectName" 
        type="text" 
        class="input input-bordered w-full mb-4" 
        placeholder="Project Name"
        autofocus
      />
      <div class="modal-action">
        <button class="btn btn-ghost" @click="showNewProjectModal = false">Cancel</button>
        <button class="btn btn-primary" @click="createProject">Create & Save</button>
      </div>
    </div>
    <div class="modal-backdrop" @click="showNewProjectModal = false"></div>
  </div>

  <!-- Delete Project Modal -->
  <div v-if="showDeleteConfirm" class="modal modal-open">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-2 flex items-center gap-2 text-error">
        <Trash2 class="w-5 h-5" />
        Delete Project
      </h3>
      <p class="text-sm text-base-content/70 mb-4">This will clear all current project data. Make sure you have exported or saved elsewhere if needed.</p>
      <div class="modal-action">
        <button class="btn btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
        <button class="btn btn-error" @click="projectStore.newProject(''); showDeleteConfirm = false">Delete Project</button>
      </div>
    </div>
    <div class="modal-backdrop" @click="showDeleteConfirm = false"></div>
  </div>
</template>
