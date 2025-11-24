<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { BookOpen, Users, Settings, PenTool, Menu, Save } from 'lucide-vue-next'
import { onMounted } from 'vue'
import { useProjectStore } from './stores/project'

const projectStore = useProjectStore()

onMounted(async () => {
  await projectStore.loadProject()
})
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
               <button @click="projectStore.saveProject" class="rounded-lg py-3">
                 <Save class="w-5 h-5" />
                 Save Project
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
</template>
