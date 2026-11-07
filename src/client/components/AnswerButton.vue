<script setup lang="ts">
export type AnswerState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dim'

defineProps<{
  index: number
  text: string
  state?: AnswerState
  /** Display only (host screen, reveal): keeps full colour, ignores clicks. */
  readonly?: boolean
}>()

defineEmits<{ pick: [index: number] }>()

const shapes = ['▲', '◆', '●', '■']
</script>

<template>
  <button
    class="answer"
    :class="[`c${index}`, state === 'dim' || state === 'wrong' ? 'dim' : '', state === 'selected' ? 'selected' : '', readonly ? 'readonly' : '']"
    :tabindex="readonly ? -1 : undefined"
    :data-testid="`answer-${index}`"
    @click="$emit('pick', index)"
  >
    <span class="shape">{{ shapes[index] }}</span>
    <span>{{ text }}</span>
    <span v-if="state === 'correct'" class="mark">✓</span>
    <span v-else-if="state === 'wrong'" class="mark">✗</span>
  </button>
</template>
