<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { PlayerSnapshot } from '../../shared/types'
import { encodeAvatar } from '../../shared/avatars'
import AnswerButton, { type AnswerState } from '../components/AnswerButton.vue'
import AvatarView from '../components/Avatar.vue'
import ConnectionStatus from '../components/ConnectionStatus.vue'
import Countdown from '../components/Countdown.vue'
import Leaderboard from '../components/Leaderboard.vue'
import Podium from '../components/Podium.vue'
import { useGameSocket } from '../composables/useGameSocket'
import { clearPin, loadPlayer } from '../session'

const router = useRouter()
const session = loadPlayer()
if (!session || !session.pin) void router.replace('/')

const sock = useGameSocket({
  pin: session?.pin ?? '0000',
  role: 'player',
  playerId: session?.playerId,
  nickname: session?.nickname,
  avatar: session ? encodeAvatar(session.avatar) : undefined,
})

watch(sock.error, (err) => {
  if (!err) return
  if (err.code === 'nickname_taken' || err.code === 'invalid_nickname' || err.code === 'not_allowed' || err.code === 'game_over') {
    void router.replace({ path: '/', query: { error: err.code } })
  }
})

/** Leave the room for good (lobby seat is freed; mid-game the seat survives a later return). */
function leave() {
  sock.send({ type: 'leave' })
  sock.disconnect()
  clearPin()
  void router.replace('/')
}

const snap = computed(() => sock.snapshot.value as PlayerSnapshot | null)
const me = computed(() => snap.value?.me ?? null)
const question = computed(() => snap.value?.question ?? null)

function answer(index: number) {
  if (!question.value || me.value?.answerIndex !== null) return
  sock.send({ type: 'answer', questionIndex: question.value.index, answerIndex: index })
}

function answerState(index: number): AnswerState {
  const s = snap.value
  if (!s) return 'idle'
  if (s.phase === 'question') return me.value?.answerIndex === index ? 'selected' : 'idle'
  if (s.correctIndex === index) return 'correct'
  return me.value?.answerIndex === index ? 'wrong' : 'dim'
}

const rankText = computed(() => (me.value && me.value.rank > 0 ? `${me.value.rank}. místo` : ''))
</script>

<template>
  <main class="screen center" :data-phase="snap?.phase ?? 'none'">
    <ConnectionStatus :status="sock.status.value" />

    <template v-if="!snap">
      <p class="big emoji">🦉</p>
      <p>Připojuji ke hře…</p>
    </template>

    <!-- Lobby -->
    <template v-else-if="snap.phase === 'lobby'">
      <h1>Jsi ve hře!</h1>
      <AvatarView v-if="me" :avatar="me.avatar" :size="120" />
      <p class="chip" data-testid="my-nickname">{{ me?.nickname }}</p>
      <p class="muted" style="color: rgba(255, 255, 255, 0.8)">
        {{ snap.title }} · hráčů: {{ snap.players.length }}<br />
        Počkej, až moderátor hru spustí.
      </p>
      <button class="ghost" style="margin-top: 1.5rem" data-testid="leave-button" @click="leave">Odejít</button>
    </template>

    <!-- Question -->
    <template v-else-if="snap.phase === 'question' && question">
      <div class="stack" style="width: 100%; max-width: 720px">
        <Countdown :ends-at="snap.questionEndsAt" :total-sec="question.timeLimitSec" :server-now="sock.serverNow" />
        <p class="muted" style="color: rgba(255, 255, 255, 0.8)">Otázka {{ question.index + 1 }} z {{ question.total }}</p>
        <h2 data-testid="question-text">{{ question.text }}</h2>
        <img v-if="question.image" :src="question.image" class="qimage" alt="" data-testid="question-image" />
        <template v-if="me?.answerIndex === null">
          <div class="answers" :class="{ many: question.answers.length > 2 }">
            <AnswerButton
              v-for="(text, i) in question.answers"
              :key="i"
              :index="i"
              :text="text"
              :state="answerState(i)"
              @pick="answer"
            />
          </div>
        </template>
        <div v-else class="card" data-testid="answered">
          <h2>Odpověď odeslána <span class="emoji">✔</span></h2>
          <p class="muted">Teď už jen počkej, jak dopadli ostatní.</p>
        </div>
      </div>
    </template>

    <!-- Reveal -->
    <template v-else-if="snap.phase === 'reveal' && question">
      <div class="stack" style="width: 100%; max-width: 720px; align-items: center">
        <h1 data-testid="result">
          <template v-if="me?.correct">Správně! <span class="emoji">🎉</span></template>
          <template v-else>Bohužel špatně</template>
        </h1>
        <p class="big" data-testid="gain">+{{ me?.lastGain ?? 0 }}</p>
        <p>Celkem máš <strong data-testid="my-score">{{ me?.score ?? 0 }}</strong> bodů</p>
        <img v-if="question.image" :src="question.image" class="qimage" alt="" />
        <div class="answers" :class="{ many: question.answers.length > 2 }">
          <AnswerButton
            v-for="(text, i) in question.answers"
            :key="i"
            :index="i"
            :text="text"
            :state="answerState(i)"
            readonly
          />
        </div>
      </div>
    </template>

    <!-- Leaderboard -->
    <template v-else-if="snap.phase === 'leaderboard'">
      <h1 data-testid="my-rank">{{ rankText }}</h1>
      <p>{{ me?.score ?? 0 }} bodů</p>
      <div class="card">
        <Leaderboard :entries="snap.leaderboard" :highlight-id="me?.id" />
      </div>
    </template>

    <!-- Podium -->
    <template v-else-if="snap.phase === 'podium'">
      <h1>Konec hry <span class="emoji">🎉</span></h1>
      <section class="result-block">
        <h2 class="block-title">Tvůj výsledek</h2>
        <div class="card me-card" data-testid="final-rank">
          <AvatarView v-if="me" :avatar="me.avatar" :size="64" />
          <div>
            <strong>{{ rankText }}</strong>
            <div class="muted">{{ me?.score ?? 0 }} bodů</div>
          </div>
        </div>
      </section>
      <section class="result-block">
        <h2 class="block-title">Stupně vítězů</h2>
        <Podium :entries="snap.leaderboard" :highlight-id="me?.id" />
      </section>
      <button class="ghost" style="margin-top: 1.5rem" data-testid="leave-button" @click="leave">Zpět na začátek</button>
    </template>
  </main>
</template>

<style scoped>
.result-block {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.block-title {
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.8;
  margin: 0;
}
.me-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  text-align: left;
  font-size: 1.4rem;
  padding: 1rem 1.25rem;
}
</style>
