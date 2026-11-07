<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import type { GameSummary, HostSnapshot } from '../../shared/types'
import { useGameSocket } from '../composables/useGameSocket'
import AnswerButton from './AnswerButton.vue'
import AvatarView from './Avatar.vue'
import ConnectionStatus from './ConnectionStatus.vue'
import Countdown from './Countdown.vue'
import Leaderboard from './Leaderboard.vue'
import Podium from './Podium.vue'

const props = defineProps<{ game: GameSummary; token: string }>()
const emit = defineEmits<{ leave: []; unauthorized: [] }>()

const sock = useGameSocket({ pin: props.game.pin, role: 'host', token: props.token })
const snap = computed(() => sock.snapshot.value as HostSnapshot | null)
const question = computed(() => snap.value?.question ?? null)
const joinUrl = computed(() => `${location.host}/?pin=${props.game.pin}`)

watch(sock.error, (err) => {
  if (err?.code === 'not_allowed') emit('unauthorized')
})

const advanceLabel = computed(() => (snap.value?.hasNextQuestion ? 'Další otázka' : 'Vyhlásit výsledky'))

const nextLabel = computed(() => {
  switch (snap.value?.phase) {
    case 'question':
      return 'Ukončit otázku'
    case 'reveal':
      return 'Zobrazit žebříček'
    case 'leaderboard':
      return advanceLabel.value
    default:
      return ''
  }
})

function start() {
  if (snap.value?.phase === 'lobby') sock.send({ type: 'start', phase: 'lobby' })
}

function next() {
  const s = snap.value
  if (!s || !question.value || s.phase === 'lobby' || s.phase === 'podium') return
  sock.send({ type: 'next', phase: s.phase, questionIndex: question.value.index })
}

/** From the reveal screen straight to the next question (or the podium), skipping the leaderboard. */
function skipLeaderboard() {
  const s = snap.value
  if (!s || !question.value || s.phase !== 'reveal') return
  sock.send({ type: 'next', phase: 'reveal', questionIndex: question.value.index, skipLeaderboard: true })
}

function reset() {
  if (snap.value?.phase === 'lobby' && snap.value.players.length === 0) return
  if (confirm('Opravdu vyprázdnit místnost? Všichni hráči budou odpojeni a skóre smazáno.')) sock.send({ type: 'reset' })
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return
  if (e.code === 'ArrowRight' && snap.value?.phase === 'reveal') {
    e.preventDefault()
    skipLeaderboard()
    return
  }
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') {
    e.preventDefault()
    if (snap.value?.phase === 'lobby') start()
    else next()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const maxCount = computed(() => Math.max(1, ...(snap.value?.answerCounts ?? [0])))
</script>

<template>
  <main class="screen" :data-phase="snap?.phase ?? 'none'">
    <ConnectionStatus :status="sock.status.value" />

    <header class="row between" style="margin-bottom: 1rem">
      <div>
        <strong><span class="emoji">🦉</span> {{ game.title }}</strong>
        <span class="muted" style="color: rgba(255, 255, 255, 0.7)"> · PIN {{ game.pin }}</span>
      </div>
      <div class="row">
        <button class="ghost" data-testid="leave-button" @click="emit('leave')">Jiná hra</button>
        <button class="danger" data-testid="reset-button" @click="reset">Vyprázdnit místnost</button>
      </div>
    </header>

    <section v-if="!snap" class="screen center" style="min-height: 0; flex: 1">
      <p>Připojuji k místnosti…</p>
    </section>

    <!-- Lobby -->
    <section v-else-if="snap.phase === 'lobby'" class="screen center" style="min-height: 0; flex: 1; padding: 0">
      <p style="opacity: 0.8">Připoj se na <strong>{{ joinUrl }}</strong></p>
      <p style="opacity: 0.8; margin: 0">PIN hry</p>
      <p class="big" data-testid="lobby-pin">{{ game.pin }}</p>
      <p data-testid="player-count">Hráčů: {{ snap.players.length }}</p>
      <div class="chips" style="max-width: 900px">
        <span
          v-for="p in snap.players"
          :key="p.id"
          class="chip with-avatar"
          :class="{ off: !p.connected }"
          :title="p.connected ? 'Připojen' : 'Odpojen'"
          data-testid="player-chip"
        >
          <AvatarView :avatar="p.avatar" :size="32" />
          {{ p.nickname }}
        </span>
      </div>
      <button class="primary" style="margin-top: 2rem; font-size: 1.3rem" :disabled="snap.players.length === 0" data-testid="start-button" @click="start">
        Spustit hru
      </button>
    </section>

    <!-- Question -->
    <section v-else-if="snap.phase === 'question' && question" class="stack" style="flex: 1; max-width: 1100px; width: 100%; margin: 0 auto">
      <div class="row between">
        <span>Otázka {{ question.index + 1 }} / {{ question.total }}</span>
        <span data-testid="answered-count">Odpovědělo {{ snap.answeredCount }} z {{ snap.players.filter((p) => p.connected).length }}</span>
      </div>
      <Countdown :ends-at="snap.questionEndsAt" :total-sec="question.timeLimitSec" :server-now="sock.serverNow" />
      <h1 style="font-size: clamp(1.6rem, 4vw, 3rem); text-align: center" data-testid="question-text">{{ question.text }}</h1>
      <div class="answers">
        <AnswerButton v-for="(text, i) in question.answers" :key="i" :index="i" :text="text" readonly />
      </div>
      <button class="primary" style="align-self: center" data-testid="next-button" @click="next">{{ nextLabel }}</button>
    </section>

    <!-- Reveal -->
    <section v-else-if="snap.phase === 'reveal' && question" class="stack" style="flex: 1; max-width: 1100px; width: 100%; margin: 0 auto">
      <h1 style="text-align: center">{{ question.text }}</h1>
      <div class="bars">
        <div v-for="(count, i) in snap.answerCounts ?? []" :key="i" class="barcol">
          <div class="count">{{ count }}</div>
          <div class="bar" :class="`c${i}`" :style="{ height: `${20 + (count / maxCount) * 160}px` }"></div>
        </div>
      </div>
      <div class="answers">
        <AnswerButton
          v-for="(text, i) in question.answers"
          :key="i"
          :index="i"
          :text="text"
          :state="i === snap.correctIndex ? 'correct' : 'dim'"
          readonly
        />
      </div>
      <div class="row" style="justify-content: center">
        <button class="primary" data-testid="skip-button" @click="skipLeaderboard">{{ advanceLabel }} →</button>
        <button class="ghost" data-testid="next-button" @click="next">{{ nextLabel }}</button>
      </div>
    </section>

    <!-- Leaderboard -->
    <section v-else-if="snap.phase === 'leaderboard'" class="screen center" style="min-height: 0; flex: 1; padding: 0">
      <h1>Žebříček</h1>
      <div class="card">
        <Leaderboard :entries="snap.leaderboard" :limit="5" />
      </div>
      <button class="primary" style="margin-top: 1.5rem" data-testid="next-button" @click="next">{{ nextLabel }}</button>
    </section>

    <!-- Podium -->
    <section v-else-if="snap.phase === 'podium'" class="screen center" style="min-height: 0; flex: 1; padding: 0">
      <h1>Výsledky <span class="emoji">🎉</span></h1>
      <Podium :entries="snap.leaderboard" />
      <div class="card" style="margin-top: 1.5rem">
        <Leaderboard :entries="snap.leaderboard" :limit="100" :show-gain="false" />
      </div>
      <p style="opacity: 0.8; margin-top: 1rem">Výsledky jsou uložené v historii. Pro další kolo vyprázdni místnost.</p>
    </section>
  </main>
</template>

<style scoped>
.bars {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 24px;
  min-height: 220px;
}
.barcol {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 80px;
}
.count {
  font-weight: 900;
  font-size: 1.5rem;
}
.bar {
  width: 100%;
  border-radius: 8px 8px 0 0;
  transition: height 300ms ease;
}
.bar.c0 {
  background: var(--red);
}
.bar.c1 {
  background: var(--blue);
}
.bar.c2 {
  background: var(--yellow);
}
.bar.c3 {
  background: var(--green);
}
</style>
