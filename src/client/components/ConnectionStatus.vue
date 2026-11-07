<script setup lang="ts">
import type { ConnectionStatus } from '../composables/useGameSocket'

defineProps<{ status: ConnectionStatus }>()

const labels: Record<ConnectionStatus, string> = {
  connected: 'Připojeno',
  connecting: 'Připojuji…',
  polling: 'Záložní režim',
  offline: 'Odpojeno',
}
</script>

<template>
  <div class="status" :class="status" data-testid="connection-status">{{ labels[status] }}</div>
</template>
