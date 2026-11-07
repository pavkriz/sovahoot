<script setup lang="ts">
import { CHARACTERS, COLORS, GLASSES, HATS, randomAvatar, type Avatar } from '../../shared/avatars'
import AvatarView from './Avatar.vue'

const model = defineModel<Avatar>({ required: true })

function set<K extends keyof Avatar>(key: K, value: Avatar[K]) {
  model.value = { ...model.value, [key]: value }
}
</script>

<template>
  <div class="picker" data-testid="avatar-picker">
    <div class="preview">
      <AvatarView :avatar="model" :size="96" />
      <button type="button" class="ghost small" data-testid="avatar-random" @click="model = randomAvatar()"><span class="emoji">🎲</span> Náhodně</button>
    </div>

    <p class="label">Postavička</p>
    <div class="grid">
      <button
        v-for="(c, i) in CHARACTERS"
        :key="c"
        type="button"
        class="opt emoji"
        :class="{ on: model.character === c }"
        :data-testid="`avatar-character-${i}`"
        @click="set('character', c)"
      >
        {{ c }}
      </button>
    </div>

    <p class="label">Na hlavu</p>
    <div class="grid">
      <button type="button" class="opt" :class="{ on: model.hat === null }" data-testid="avatar-hat-none" @click="set('hat', null)">✕</button>
      <button
        v-for="(h, i) in HATS"
        :key="h"
        type="button"
        class="opt emoji"
        :class="{ on: model.hat === h }"
        :data-testid="`avatar-hat-${i}`"
        @click="set('hat', h)"
      >
        {{ h }}
      </button>
    </div>

    <p class="label">Brýle</p>
    <div class="grid">
      <button type="button" class="opt" :class="{ on: model.glasses === null }" data-testid="avatar-glasses-none" @click="set('glasses', null)">✕</button>
      <button
        v-for="(g, i) in GLASSES"
        :key="g"
        type="button"
        class="opt emoji"
        :class="{ on: model.glasses === g }"
        :data-testid="`avatar-glasses-${i}`"
        @click="set('glasses', g)"
      >
        {{ g }}
      </button>
    </div>

    <p class="label">Barva</p>
    <div class="grid">
      <button
        v-for="(col, i) in COLORS"
        :key="col"
        type="button"
        class="opt swatch"
        :class="{ on: model.color === col }"
        :style="{ background: col }"
        :data-testid="`avatar-color-${i}`"
        :aria-label="`Barva ${i + 1}`"
        @click="set('color', col)"
      />
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
}
.preview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem 0 0.75rem;
}
.label {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.opt {
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 10px;
  background: #f1f1f1;
  color: var(--ink);
  box-shadow: none;
  font-size: 1.4rem;
  display: grid;
  place-items: center;
  border: 3px solid transparent;
}
.opt.on {
  border-color: var(--purple);
  background: #ece4ff;
}
.swatch.on {
  outline: 3px solid var(--purple);
  outline-offset: 2px;
  border-color: #fff;
}
.ghost.small {
  color: var(--ink);
  border-color: #ccc;
  padding: 0.5rem 0.9rem;
}
</style>
