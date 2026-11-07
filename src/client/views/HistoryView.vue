<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { GameSummary, ScoreRow } from '../../shared/types'

const rows = ref<ScoreRow[]>([])
const games = ref<GameSummary[]>([])
const loading = ref(true)

interface Session {
  id: string
  gameId: string
  playedAt: string
  rows: ScoreRow[]
}

const sessions = computed<Session[]>(() => {
  const map = new Map<string, Session>()
  for (const r of rows.value) {
    const s = map.get(r.session_id) ?? { id: r.session_id, gameId: r.game_id, playedAt: r.played_at, rows: [] }
    s.rows.push(r)
    map.set(r.session_id, s)
  }
  return [...map.values()]
})

function title(gameId: string): string {
  return games.value.find((g) => g.id === gameId)?.title ?? gameId
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(async () => {
  try {
    const [g, s] = await Promise.all([fetch('/api/games'), fetch('/api/scores')])
    games.value = (await g.json()) as GameSummary[]
    rows.value = (await s.json()) as ScoreRow[]
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="screen" style="align-items: center">
    <div class="stack" style="width: 100%; max-width: 720px">
      <div class="row between">
        <h1>Historie výsledků</h1>
        <router-link to="/">Zpět</router-link>
      </div>
      <p v-if="loading">Načítám…</p>
      <p v-else-if="sessions.length === 0" data-testid="history-empty">Zatím se nehrálo.</p>
      <article v-for="s in sessions" :key="s.id" class="card wide" data-testid="history-session">
        <h2>{{ title(s.gameId) }}</h2>
        <p class="muted">{{ formatDate(s.playedAt) }} · {{ s.rows.length }} hráčů</p>
        <table>
          <tbody>
            <tr v-for="r in s.rows" :key="r.rank + r.nickname">
              <td class="num" style="width: 3rem">{{ r.rank }}.</td>
              <td>{{ r.nickname }}</td>
              <td class="num">{{ r.score }}</td>
            </tr>
          </tbody>
        </table>
      </article>
    </div>
  </main>
</template>
