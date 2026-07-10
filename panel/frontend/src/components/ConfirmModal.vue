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
  <div v-if="open" class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal" role="dialog" aria-modal="true">
      <h2 style="margin-bottom: 12px">{{ title }}</h2>
      <p style="font-size: 14.5px; line-height: 1.6; color: rgba(255, 255, 255, 0.65); margin: 0 0 18px">
        {{ message }}
      </p>
      <div class="field">
        <label :for="'confirm-input'" style="text-transform: none; font-weight: 400; color: rgba(255, 255, 255, 0.5)">
          Escribe <strong style="color: rgba(255, 255, 255, 0.85)">{{ confirmWord }}</strong> para confirmar
        </label>
        <input id="confirm-input" v-model="typed" autocomplete="off" />
      </div>
      <div class="modal-actions">
        <button @click="emit('cancel')">Cancelar</button>
        <button class="danger solid" :disabled="typed !== confirmWord" @click="emit('confirm')">Eliminar</button>
      </div>
    </div>
  </div>
</template>
