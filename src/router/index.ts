import { createRouter, createWebHashHistory } from 'vue-router'
import EditorView from '../views/EditorView.vue'
import OutlineView from '../views/OutlineView.vue'
import CharactersView from '../views/CharactersView.vue'
import SettingsView from '../views/SettingsView.vue'

const routes = [
  { path: '/', redirect: '/editor' },
  { path: '/editor', component: EditorView },
  { path: '/outline', component: OutlineView },
  { path: '/characters', component: CharactersView },
  { path: '/settings', component: SettingsView },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
