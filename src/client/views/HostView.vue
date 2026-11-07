<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { GameSummary } from '../../shared/types'
import HostRoom from '../components/HostRoom.vue'
import { loadHostToken, saveHostToken } from '../session'

const token = ref<string | null>(loadHostToken())
const password = ref('')
const loginError = ref('')
const games = ref<GameSummary[]>([])
const selected = ref<GameSummary | null>(null)
const busy = ref(false)

async function login() {
  busy.value = true
  loginError.value = ''
  try {
    const res = await fetch('/api/host/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    })
    if (!res.ok) {
      loginError.value = res.status === 401 ? 'Špatné heslo.' : 'Přihlášení se nepodařilo.'
      return
    }
    const body = (await res.json()) as { token: string }
    token.value = body.token
    saveHostToken(body.token)
    password.value = ''
    await loadGames()
  } catch {
    loginError.value = 'Server neodpovídá.'
  } finally {
    busy.value = false
  }
}

async function loadGames() {
  const res = await fetch('/api/games')
  games.value = (await res.json()) as GameSummary[]
}

function logout() {
  token.value = null
  saveHostToken(null)
  selected.value = null
}

onMounted(() => {
  if (token.value) void loadGames()
})
</script>

<template>
  <HostRoom v-if="token && selected" :game="selected" :token="token" @leave="selected = null" @unauthorized="logout" />

  <main v-else class="screen center">
    <div class="logo">🦉 Sovahoot <small>moderátor</small></div>

    <form v-if="!token" class="card stack" @submit.prevent="login">
      <input v-model="password" type="password" placeholder="Heslo moderátora" data-testid="host-password" autocomplete="current-password" />
      <p v-if="loginError" class="error">{{ loginError }}</p>
      <button class="primary" type="submit" :disabled="busy" data-testid="host-login">Přihlásit</button>
      <router-link to="/" class="muted" style="text-align: center">Zpět</router-link>
    </form>

    <div v-else class="card stack">
      <h2>Vyber hru</h2>
      <button v-for="g in games" :key="g.id" class="primary" :data-testid="`game-${g.id}`" @click="selected = g">
        {{ g.title }}
        <span style="display: block; font-weight: 500; opacity: 0.9">PIN {{ g.pin }} · {{ g.questionCount }} otázek</span>
      </button>
      <p v-if="games.length === 0" class="muted">Načítám hry…</p>
      <button class="ghost" style="color: var(--ink); border-color: #ccc" @click="logout">Odhlásit</button>
    </div>
  </main>
</template>
