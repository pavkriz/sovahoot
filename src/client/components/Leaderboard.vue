<script setup lang="ts">
import type { LeaderboardEntry } from '../../shared/types'
import AvatarView from './Avatar.vue'

withDefaults(
  defineProps<{
    entries: LeaderboardEntry[]
    limit?: number
    highlightId?: string | null
    showGain?: boolean
  }>(),
  { limit: 5, highlightId: null, showGain: true },
)
</script>

<template>
  <table data-testid="leaderboard">
    <tbody>
      <tr v-for="e in entries.slice(0, limit)" :key="e.id" :class="{ me: e.id === highlightId }">
        <td class="num rank">{{ e.rank }}.</td>
        <td class="who"><AvatarView :avatar="e.avatar" :size="32" /> {{ e.nickname }}</td>
        <td v-if="showGain" class="num gain">
          <span v-if="e.lastGain > 0">+{{ e.lastGain }}</span>
        </td>
        <td class="num">{{ e.score }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
table {
  font-size: 1.25rem;
}
.rank {
  width: 3rem;
  font-weight: 800;
}
.who {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.gain {
  color: var(--green);
  font-weight: 700;
}
</style>
