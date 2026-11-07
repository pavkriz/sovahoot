<script setup lang="ts">
// Tuning sheet: every character × hat combination at a large size. Not linked from the UI.
import { CHARACTERS, COLORS, HATS } from '../../shared/avatars'
import AvatarView from '../components/Avatar.vue'
</script>

<template>
  <main class="screen" style="align-items: center">
    <div class="card wide" style="max-width: none">
      <table class="sheet" data-testid="avatar-sheet">
        <thead>
          <tr>
            <th></th>
            <th>bez</th>
            <th v-for="h in HATS" :key="h" class="emoji">{{ h }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, i) in CHARACTERS" :key="c">
            <th class="emoji">{{ c }}</th>
            <td><AvatarView :avatar="{ character: c, hat: null, color: COLORS[i % COLORS.length]! }" :size="128" /></td>
            <td v-for="h in HATS" :key="h">
              <AvatarView :avatar="{ character: c, hat: h, color: COLORS[i % COLORS.length]! }" :size="128" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<style scoped>
.sheet td,
.sheet th {
  text-align: center;
  padding: 18px 10px;
  border: 0;
}
.sheet th {
  font-size: 1.6rem;
}
</style>
