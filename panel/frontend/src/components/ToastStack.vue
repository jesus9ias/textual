<script setup lang="ts">
import { toasts, removeToast } from '../toast';
</script>

<template>
  <div class="toast-stack">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">
      <span class="icon">{{ t.kind === 'success' ? '✓' : '✕' }}</span>
      <span class="text">{{ t.text }}</span>
      <button class="close" @click="removeToast(t.id)">×</button>
    </div>
  </div>
</template>
