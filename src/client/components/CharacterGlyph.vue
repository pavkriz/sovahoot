<script setup lang="ts">
// One character glyph at the surrounding font size. Composite characters (an object with eyes)
// draw the overlay on top of the base glyph; offsets are in em, so any size works.
import { computed } from 'vue'
import { characterParts } from '../../shared/avatars'

const props = defineProps<{ character: string }>()

const parts = computed(() => characterParts(props.character))
// Scaling the whole glyph keeps the eyes where they were tuned relative to the base.
const glyphStyle = computed(() => (parts.value.scale === 1 ? {} : { transform: `scale(${parts.value.scale})` }))
const overlayStyle = computed(() => {
  const o = parts.value.overlay
  if (!o) return {}
  return { transform: `translate(calc(-50% + ${o.x}em), calc(-50% + ${o.y}em)) rotate(${o.r}deg) scale(${o.s})` }
})
</script>

<template>
  <span class="glyph emoji" :style="glyphStyle" :title="character"
    >{{ parts.base }}<span v-if="parts.overlay" class="overlay" :style="overlayStyle">{{ parts.overlay.glyph }}</span></span
  >
</template>

<style scoped>
.glyph {
  position: relative;
  display: inline-block;
  line-height: 1;
}
.overlay {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center;
  pointer-events: none;
}
</style>
