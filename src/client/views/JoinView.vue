<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { forgetPlayer, loadPlayer, savePlayer } from '../session'

const route = useRoute()
const router = useRouter()

const existing = loadPlayer()
const pin = ref(typeof route.query.pin === 'string' ? route.query.pin : (existing?.pin ?? ''))
const nickname = ref(existing?.nickname ?? '')
const localError = ref('')

const errorTexts: Record<string, string> = {
  nickname_taken: 'Tuhle přezdívku už někdo ve hře používá. Zvol si jinou.',
  invalid_nickname: 'Přezdívka musí mít 1 až 20 znaků.',
  not_allowed: 'Hru s tímto PINem se nepodařilo najít.',
  unknown_pin: 'Hra s tímto PINem neexistuje.',
}
const error = computed(() => localError.value || (typeof route.query.error === 'string' ? errorTexts[route.query.error] ?? '' : ''))

async function submit() {
  localError.value = ''
  const p = pin.value.trim()
  const n = nickname.value.trim()
  if (!/^\d{4}$/.test(p)) {
    localError.value = 'PIN má 4 číslice.'
    return
  }
  if (n.length === 0 || n.length > 20) {
    localError.value = 'Přezdívka musí mít 1 až 20 znaků.'
    return
  }
  // A rejected nickname means the old identity must not be reused.
  if (route.query.error === 'nickname_taken' || route.query.error === 'invalid_nickname') forgetPlayer()
  savePlayer(n, p)
  await router.push('/play')
}
</script>

<template>
  <main class="screen center">
    <div class="logo">
      🦉 Sovahoot
      <small>kvíz pro chytré sovy</small>
    </div>
    <form class="card stack" @submit.prevent="submit">
      <input
        v-model="pin"
        data-testid="pin-input"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="4"
        placeholder="PIN hry"
        autocomplete="off"
        aria-label="PIN hry"
      />
      <input
        v-model="nickname"
        data-testid="nickname-input"
        maxlength="20"
        placeholder="Přezdívka"
        autocomplete="off"
        aria-label="Přezdívka"
      />
      <p v-if="error" class="error" data-testid="join-error">{{ error }}</p>
      <button class="primary" type="submit" data-testid="join-button">Vstoupit do hry</button>
    </form>
    <p class="row" style="margin-top: 2rem; gap: 1.5rem">
      <router-link to="/host">Jsem moderátor</router-link>
      <router-link to="/history">Historie výsledků</router-link>
    </p>
  </main>
</template>
