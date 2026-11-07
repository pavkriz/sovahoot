<script setup lang="ts">
import { computed } from 'vue'
import type { LeaderboardEntry } from '../../shared/types'
import AvatarView from './Avatar.vue'

const props = defineProps<{ entries: LeaderboardEntry[] }>()

// Visual order: 2nd, 1st, 3rd.
const slots = computed(() => {
  const [first, second, third] = props.entries
  return [
    { entry: second, place: 2, height: 110 },
    { entry: first, place: 1, height: 150 },
    { entry: third, place: 3, height: 80 },
  ].filter((s) => s.entry)
})
const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
</script>

<template>
  <div class="podium" data-testid="podium">
    <div v-for="s in slots" :key="s.place" class="slot">
      <AvatarView :avatar="s.entry!.avatar" :size="s.place === 1 ? 72 : 56" />
      <div class="name">{{ s.entry!.nickname }}</div>
      <div class="score">{{ s.entry!.score }}</div>
      <div class="block" :style="{ height: `${s.height}px` }">{{ medals[s.place] }}</div>
    </div>
  </div>
</template>

<style scoped>
.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 12px;
  width: 100%;
  max-width: 560px;
}
.slot {
  flex: 1;
  text-align: center;
}
.slot :deep(.avatar) {
  margin-bottom: 0.4rem;
}
.name {
  font-weight: 800;
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}
.score {
  opacity: 0.85;
  margin-bottom: 0.4rem;
}
.block {
  background: var(--white);
  color: var(--ink);
  border-radius: 12px 12px 0 0;
  display: grid;
  place-items: center;
  font-size: 2.2rem;
}
</style>
