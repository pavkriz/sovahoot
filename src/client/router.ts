import { createRouter, createWebHistory } from 'vue-router'
import AvatarSheetView from './views/AvatarSheetView.vue'
import HistoryView from './views/HistoryView.vue'
import HostView from './views/HostView.vue'
import JoinView from './views/JoinView.vue'
import PlayView from './views/PlayView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: JoinView },
    { path: '/play', component: PlayView },
    { path: '/host', component: HostView },
    { path: '/history', component: HistoryView },
    { path: '/avatars', component: AvatarSheetView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
