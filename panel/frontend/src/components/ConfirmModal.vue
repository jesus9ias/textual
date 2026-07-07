<script setup lang="ts">
/**
 * Global confirmation modal for destructive actions. The confirm button stays
 * disabled until the user types the exact confirmation word (per the monorepo's
 * typed-confirmation rule — "eliminar" for the panel's deletes). No action ever
 * fires from a single click.
 */
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmWord?: string;
  }>(),
  { confirmWord: 'eliminar' },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const typed = ref('');
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) typed.value = '';
  },
);
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('cancel')">
    <div class="modal" role="dialog" aria-modal="true">
      <h3>{{ title }}</h3>
      <p>{{ message }}</p>
      <label :for="'confirm-input'">
        Escribe <strong>{{ confirmWord }}</strong> para confirmar
      </label>
      <input id="confirm-input" v-model="typed" autocomplete="off" />
      <div class="actions">
        <button @click="emit('cancel')">Cancelar</button>
        <button class="danger" :disabled="typed !== confirmWord" @click="emit('confirm')">Eliminar</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  background: #fff;
  border-radius: 10px;
  padding: 1.25rem;
  width: min(28rem, 92vw);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
