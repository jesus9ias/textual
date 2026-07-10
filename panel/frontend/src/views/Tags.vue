<script setup lang="ts">
/**
 * Tags view: list/create/edit/delete. Tags can always be deleted; the
 * confirmation modal states the exact number of posts that will lose the tag
 * (computed from the posts list) and typing "eliminar" confirms. On confirm the
 * backend removes the tag from every affected post. Tags are created only here.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import type { PostListItem, Tag } from '../types';
import ConfirmModal from '../components/ConfirmModal.vue';
import { addToast } from '../toast';

const tags = ref<Tag[]>([]);
const posts = ref<PostListItem[]>([]);
const error = ref('');

const emptyForm = (): Tag & { mode: 'create' | 'edit' | null } => ({
  mode: null,
  id: '',
  es: { slug: '', title: '' },
  en: { slug: '', title: '' },
});
const form = ref(emptyForm());

const pending = ref<Tag | null>(null);
const confirmOpen = ref(false);

async function load() {
  const [t, p] = await Promise.all([api.listTags(), api.listPosts()]);
  tags.value = t.data?.tags ?? [];
  posts.value = p.data?.posts ?? [];
}
onMounted(load);

const usageOf = (tagId: string) => posts.value.filter((p) => p.tagIds.includes(tagId)).length;
const tagsProcessed = computed(() => tags.value.map((t) => ({ ...t, count: usageOf(t.id) })));
const canSave = computed(() => form.value.id && form.value.es.title && form.value.en.title);

function startCreate() {
  form.value = { ...emptyForm(), mode: 'create' };
}
function startEdit(t: Tag) {
  form.value = { mode: 'edit', id: t.id, es: { ...t.es }, en: { ...t.en } };
}
function cancelForm() {
  form.value = emptyForm();
}

async function save() {
  error.value = '';
  const body: Tag = { id: form.value.id, es: form.value.es, en: form.value.en };
  const res = form.value.mode === 'create' ? await api.createTag(body) : await api.updateTag(body.id, body);
  if (!res.ok) {
    error.value = res.data?.error ?? 'Error al guardar.';
    return;
  }
  cancelForm();
  addToast('Etiqueta guardada', 'success');
  await load();
}

function beginDelete(t: Tag) {
  pending.value = t;
  confirmOpen.value = true;
}
async function confirmDelete() {
  if (!pending.value) return;
  await api.deleteTag(pending.value.id);
  confirmOpen.value = false;
  pending.value = null;
  addToast('Etiqueta eliminada', 'success');
  await load();
}
function cancelDelete() {
  pending.value = null;
  confirmOpen.value = false;
}

const pendingMessage = computed(() =>
  pending.value ? `${usageOf(pending.value.id)} posts perderán esta etiqueta. Esta acción no se puede deshacer.` : '',
);
</script>

<template>
  <div>
    <div class="row-between">
      <h1>Etiquetas</h1>
      <button class="primary" @click="startCreate">+ Nueva etiqueta</button>
    </div>
    <p v-if="error" class="warning">{{ error }}</p>

    <div class="panel panel-pad" style="display: flex; flex-wrap: wrap; gap: 12px">
      <div v-for="t in tagsProcessed" :key="t.id" class="chip">
        <button type="button" class="ghost" style="padding: 0; font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.9)" @click="startEdit(t)">
          {{ t.es.title }}
        </button>
        <span class="count">{{ t.count }}</span>
        <button type="button" class="x" title="Eliminar etiqueta" @click="beginDelete(t)">×</button>
      </div>
      <div v-if="tagsProcessed.length === 0" class="muted">Aún no hay etiquetas.</div>
    </div>

    <!-- Create / edit modal -->
    <div v-if="form.mode" class="modal-overlay" @click.self="cancelForm">
      <div class="modal wide">
        <h2 style="margin-bottom: 18px">{{ form.mode === 'create' ? 'Nueva etiqueta' : `Editar ${form.id}` }}</h2>

        <div class="field">
          <label style="text-transform: none; color: rgba(255, 255, 255, 0.45); font-weight: 400">id</label>
          <input v-model="form.id" :disabled="form.mode === 'edit'" placeholder="p.ej. relatividad" class="mono" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px">
          <div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">ES título</label>
              <input v-model="form.es.title" />
            </div>
            <div class="field" style="margin-bottom: 0">
              <label style="color: rgba(147, 183, 255, 0.85)">ES slug</label>
              <input v-model="form.es.slug" class="mono" />
            </div>
          </div>
          <div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">EN título</label>
              <input v-model="form.en.title" />
            </div>
            <div class="field" style="margin-bottom: 0">
              <label style="color: rgba(147, 183, 255, 0.85)">EN slug</label>
              <input v-model="form.en.slug" class="mono" />
            </div>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 20px">
          <button @click="cancelForm">Cancelar</button>
          <button class="primary" :disabled="!canSave" @click="save">Guardar</button>
        </div>
      </div>
    </div>

    <ConfirmModal
      :open="confirmOpen"
      title="Eliminar etiqueta"
      :message="pendingMessage"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>
