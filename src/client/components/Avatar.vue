<script setup lang="ts">
import { computed } from 'vue'
import { hatPlacement, type Avatar } from '../../shared/avatars'
import CharacterGlyph from './CharacterGlyph.vue'

const props = withDefaults(defineProps<{ avatar: Avatar; size?: number }>(), { size: 48 })

const hatStyle = computed(() => {
  const p = hatPlacement(props.avatar.character, props.avatar.hat)
  return {
    '--hat-x': `${p.x * props.size}px`,
    '--hat-y': `${p.y * props.size}px`,
    '--hat-r': `${p.r}deg`,
    '--hat-s': String(p.s),
  }
})
</script>

<template>
  <span
    class="avatar"
    :style="{ '--size': `${size}px`, background: avatar.color }"
    :title="[avatar.character, avatar.hat].filter(Boolean).join(' ')"
    data-testid="avatar"
  >
    <CharacterGlyph class="character" :character="avatar.character" />
    <span v-if="avatar.hat" class="hat emoji" :style="hatStyle">{{ avatar.hat }}</span>
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
  font-size: calc(var(--size) * 0.4);
  /* Anchor: hat centre on the top edge, then the per-character offset from hatPlacement(). */
  transform: translate(calc(-50% + var(--hat-x)), calc(-50% + var(--hat-y))) rotate(var(--hat-r)) scale(var(--hat-s));
  transform-origin: center;
  pointer-events: none;
}
</style>
