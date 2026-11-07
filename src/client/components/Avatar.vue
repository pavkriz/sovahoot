<script setup lang="ts">
import type { Avatar } from '../../shared/avatars'

withDefaults(defineProps<{ avatar: Avatar; size?: number }>(), { size: 48 })
</script>

<template>
  <span
    class="avatar"
    :style="{ '--size': `${size}px`, background: avatar.color }"
    :title="[avatar.character, avatar.hat].filter(Boolean).join(' ')"
    data-testid="avatar"
  >
    <span class="character emoji">{{ avatar.character }}</span>
    <span v-if="avatar.hat" class="hat emoji">{{ avatar.hat }}</span>
  </span>
</template>

<style scoped>
.avatar {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  flex: none;
  line-height: 1;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.15);
  overflow: visible;
}
.character {
  font-size: calc(var(--size) * 0.6);
}
.hat {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translate(-50%, -55%) rotate(-8deg);
  font-size: calc(var(--size) * 0.4);
}
</style>
