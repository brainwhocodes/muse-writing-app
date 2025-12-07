<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { BookOpen, Users, Settings, PenTool, Menu, Save, Plus, AlertCircle, Trash2, FolderOpen, Clock, Cloud, CloudOff, Loader2, ChevronDown } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useProjectStore } from './stores/project'

const projectStore = useProjectStore()
const showNewProjectModal = ref(false)
const newProjectName = ref('')
const showDeleteConfirm = ref(false)
const showProjectSelector = ref(false)
const isEditing = ref(false)
const editedProjectName = ref('')
const hasUnsavedChanges = ref(false)
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const projectToDelete = ref<string | null>(null)

const saveStatusText = computed(() => {
  if (projectStore.isSaving) return 'Saving...'
  if (projectStore.loadError) return 'Error'
  if (hasUnsavedChanges.value) return 'Unsaved changes'
  if (projectStore.lastSavedAt) {
    const diff = Date.now() - new Date(projectStore.lastSavedAt).getTime()
    if (diff < 60000) return 'Just saved'
    return `Saved ${new Date(projectStore.lastSavedAt).toLocaleTimeString()}`
  }
  return 'Not saved'
})

const saveStatusColor = computed(() => {
  if (projectStore.loadError) return 'text-error'
  if (hasUnsavedChanges.value) return 'text-warning'
  if (projectStore.isSaving) return 'text-info'
  return 'text-success'
})

// Watch for changes and mark as unsaved
watch(
  () => [
    projectStore.storyOutline, 
    projectStore.characterOutline, 
    projectStore.terminology, 
    projectStore.bookMetadata,
    projectStore.storyBible
  ],
  () => {
    hasUnsavedChanges.value = true
    // Auto-save after 30 seconds of no changes
    if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value)
    autoSaveTimer.value = setTimeout(async () => {
      if (hasUnsavedChanges.value) {
        await projectStore.saveProject()
        hasUnsavedChanges.value = false
      }
    }, 30000)
  },
  { deep: true }
)

// Keyboard shortcut for save (Ctrl+S)
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveNow()
  }
}

async function saveNow() {
  await projectStore.saveProject()
  hasUnsavedChanges.value = false
}

async function openProjectSelector() {
  await projectStore.listProjects()
  showProjectSelector.value = true
}

async function selectProject(projectId: string) {
  if (hasUnsavedChanges.value) {
    if (!confirm('You have unsaved changes. Switch project anyway?')) return
  }
  await projectStore.switchProject(projectId)
  hasUnsavedChanges.value = false
  showProjectSelector.value = false
}

async function confirmDeleteProject(projectId: string) {
  projectToDelete.value = projectId
  showDeleteConfirm.value = true
}

async function executeDeleteProject() {
  if (!projectToDelete.value) return
  await projectStore.deleteProject(projectToDelete.value)
  projectToDelete.value = null
  showDeleteConfirm.value = false
  await projectStore.listProjects()
}

onMounted(async () => {
  // Load project list first
  await projectStore.listProjects()
  // Load most recent project or create new one
  if (projectStore.projectList.length > 0) {
    await projectStore.loadProject(projectStore.projectList[0].id)
  } else {
    projectStore.newProject('Untitled Project')
  }
  hasUnsavedChanges.value = false
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (autoSaveTimer.value) clearTimeout(autoSaveTimer.value)
})

async function createProject() {
  projectStore.newProject(newProjectName.value.trim() || 'Untitled Project')
  showNewProjectModal.value = false
  newProjectName.value = ''
  await projectStore.saveProject()
  hasUnsavedChanges.value = false
}

function startEditProjectName() {
  editedProjectName.value = projectStore.bookMetadata.title
  isEditing.value = true
}

function saveProjectName() {
  if (editedProjectName.value.trim()) {
    projectStore.bookMetadata.title = editedProjectName.value.trim()
  }
  isEditing.value = false
}
</script>

<template>
  <div class="drawer lg:drawer-open bg-base-100 h-screen font-sans">
    <input id="my-drawer-2" type="checkbox" class="drawer-toggle" />
    <div class="drawer-content flex flex-col h-screen overflow-hidden">
      
      <!-- Top Toolbar -->
      <div class="w-full h-12 bg-base-200 border-b border-base-300 flex items-center px-4 gap-3 shrink-0">
        <!-- Mobile Menu -->
        <label for="my-drawer-2" class="btn btn-ghost btn-sm btn-square lg:hidden">
          <Menu class="w-5 h-5" />
        </label>
        
        <!-- Project Name (Clickable to open selector) -->
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <template v-if="isEditing">
            <FolderOpen class="w-4 h-4 text-primary shrink-0" />
            <input 
              v-model="editedProjectName"
              @blur="saveProjectName"
              @keyup.enter="saveProjectName"
              @keyup.escape="isEditing = false"
              class="input input-sm input-bordered flex-1 max-w-xs"
              autofocus
            />
          </template>
          <template v-else>
            <button 
              @click="openProjectSelector"
              class="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-base-300 transition-colors"
              title="Switch projects"
            >
              <FolderOpen class="w-4 h-4 text-primary shrink-0" />
              <span class="font-semibold text-sm truncate max-w-[200px]">
                {{ projectStore.bookMetadata.title || 'Untitled Project' }}
              </span>
              <ChevronDown class="w-3 h-3 opacity-50" />
            </button>
            <button 
              @click="startEditProjectName"
              class="btn btn-ghost btn-xs btn-square opacity-50 hover:opacity-100"
              title="Rename project"
            >
              <PenTool class="w-3 h-3" />
            </button>
          </template>
        </div>

        <!-- Save Status -->
        <div class="flex items-center gap-2" :class="saveStatusColor">
          <Loader2 v-if="projectStore.isSaving" class="w-4 h-4 animate-spin" />
          <Cloud v-else-if="!hasUnsavedChanges && projectStore.lastSavedAt" class="w-4 h-4" />
          <CloudOff v-else-if="hasUnsavedChanges" class="w-4 h-4" />
          <AlertCircle v-else-if="projectStore.loadError" class="w-4 h-4" />
          <Clock v-else class="w-4 h-4" />
          <span class="text-xs hidden sm:inline">{{ saveStatusText }}</span>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-1">
          <button 
            @click="saveNow" 
            class="btn btn-ghost btn-sm gap-1"
            :disabled="projectStore.isSaving || !hasUnsavedChanges"
            title="Save (Ctrl+S)"
          >
            <Save class="w-4 h-4" />
            <span class="hidden md:inline">Save</span>
          </button>
          <button 
            @click="showNewProjectModal = true" 
            class="btn btn-ghost btn-sm gap-1"
            title="New Project"
          >
            <Plus class="w-4 h-4" />
            <span class="hidden md:inline">New</span>
          </button>
        </div>
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
        <div class="p-4 border-t border-base-300">
          <ul class="menu w-full gap-1">
             <li>
              <RouterLink to="/settings" active-class="active bg-neutral text-neutral-content" class="rounded-lg py-3">
                <Settings class="w-5 h-5" />
                Settings
              </RouterLink>
            </li>
            <li>
               <button @click="showDeleteConfirm = true" class="rounded-lg py-3 text-error hover:bg-error/10">
                 <Trash2 class="w-5 h-5" />
                 Delete Project
               </button>
             </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>

  <!-- Error Toast (only for errors) -->
  <div class="toast toast-end z-50" v-if="projectStore.loadError">
    <div class="alert alert-error shadow-lg">
      <AlertCircle class="w-5 h-5" />
      <span>{{ projectStore.loadError }}</span>
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

  <!-- Project Selector Modal -->
  <div v-if="showProjectSelector" class="modal modal-open z-50!">
    <div class="modal-box max-w-lg">
      <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
        <FolderOpen class="w-5 h-5 text-primary" />
        Your Projects
      </h3>
      
      <div v-if="projectStore.projectList.length === 0" class="text-center py-8 text-base-content/50">
        <p>No projects yet. Create your first one!</p>
      </div>
      
      <div v-else class="space-y-2 max-h-[50vh] overflow-y-auto">
        <div
          v-for="project in projectStore.projectList"
          :key="project.id"
          @click="selectProject(project.id)"
          class="w-full flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer"
          :class="project.id === projectStore.currentProjectId 
            ? 'bg-primary/10 border-primary/30' 
            : 'bg-base-200/50 border-base-200 hover:bg-base-200'"
        >
          <div class="flex-1 min-w-0">
            <div class="font-semibold truncate">{{ project.title || 'Untitled' }}</div>
            <div class="text-xs text-base-content/50">
              {{ project.author || 'No author' }}
              <span v-if="project.updatedAt"> • {{ new Date(project.updatedAt).toLocaleDateString() }}</span>
            </div>
          </div>
          <div v-if="project.id === projectStore.currentProjectId" class="badge badge-primary badge-sm">Current</div>
          <button 
            @click.stop="confirmDeleteProject(project.id)"
            class="btn btn-ghost btn-xs btn-square text-error opacity-50 hover:opacity-100"
            title="Delete project"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>
      </div>
      
      <div class="modal-action border-t border-base-200 pt-4 mt-4">
        <button class="btn btn-ghost" @click="showProjectSelector = false">Close</button>
        <button class="btn btn-primary gap-2" @click="showProjectSelector = false; showNewProjectModal = true">
          <Plus class="w-4 h-4" />
          New Project
        </button>
      </div>
    </div>
    <div class="modal-backdrop" @click="showProjectSelector = false"></div>
  </div>

  <!-- Delete Project Modal -->
  <div v-if="showDeleteConfirm" class="modal modal-open z-100!">
    <div class="modal-box max-w-md">
      <h3 class="font-bold text-lg mb-2 flex items-center gap-2 text-error">
        <Trash2 class="w-5 h-5" />
        Delete Project
      </h3>
      <p class="text-sm text-base-content/70 mb-4">
        This will permanently delete this project and all its data. This cannot be undone.
      </p>
      <div class="modal-action">
        <button class="btn btn-ghost" @click="showDeleteConfirm = false; projectToDelete = null">Cancel</button>
        <button class="btn btn-error" @click="executeDeleteProject">Delete Forever</button>
      </div>
    </div>
    <div class="modal-backdrop" @click="showDeleteConfirm = false; projectToDelete = null"></div>
  </div>
</template>
