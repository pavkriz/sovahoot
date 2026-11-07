<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  /** Server-side deadline (ms since epoch) or null when no question is running. */
  endsAt: number | null
  totalSec: number
  /** Server-synchronised clock from useGameSocket. */
  serverNow: () => number
}>()

const now = ref(props.serverNow())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => (now.value = props.serverNow()), 100)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const remainingMs = computed(() => (props.endsAt === null ? 0 : Math.max(0, props.endsAt - now.value)))
const seconds = computed(() => Math.ceil(remainingMs.value / 1000))
const fraction = computed(() => (props.totalSec > 0 ? remainingMs.value / (props.totalSec * 1000) : 0))
</script>

<template>
  <div class="countdown" data-testid="countdown">
    <div class="count" :class="{ urgent: seconds <= 5 }">{{ seconds }}</div>
    <div class="bar"><div class="fill" :style="{ width: `${Math.min(100, fraction * 100)}%` }" /></div>
  </div>
</template>

<style scoped>
.countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}
.count {
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  background: var(--purple-dark);
  display: grid;
  place-items: center;
  font-size: 2rem;
  font-weight: 900;
}
.count.urgent {
  background: var(--red);
}
.bar {
  width: 100%;
  height: 10px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--white);
  transition: width 100ms linear;
}
</style>
