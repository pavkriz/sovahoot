<script setup lang="ts">
import type { LeaderboardEntry } from '../../shared/types'

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
        <td>{{ e.nickname }}</td>
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
.gain {
  color: var(--green);
  font-weight: 700;
}
</style>
