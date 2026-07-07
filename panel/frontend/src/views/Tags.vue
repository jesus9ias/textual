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
  <section>
    <div class="row" style="justify-content: space-between">
      <h2>Etiquetas</h2>
      <button class="primary" @click="startCreate">Nueva etiqueta</button>
    </div>
    <p v-if="error" class="warning">{{ error }}</p>

    <table>
      <thead>
        <tr><th>id</th><th>ES</th><th>EN</th><th>Usos</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="t in tags" :key="t.id">
          <td><code>{{ t.id }}</code></td>
          <td>{{ t.es.title }}</td>
          <td>{{ t.en.title }}</td>
          <td>{{ usageOf(t.id) }}</td>
          <td class="row">
            <button @click="startEdit(t)">Editar</button>
            <button class="danger" @click="beginDelete(t)">Eliminar</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="form.mode" class="card">
      <h3>{{ form.mode === 'create' ? 'Nueva etiqueta' : `Editar ${form.id}` }}</h3>
      <label>id</label>
      <input v-model="form.id" :disabled="form.mode === 'edit'" placeholder="p.ej. relatividad" />
      <div class="row" style="gap: 1rem; align-items: flex-start">
        <div style="flex: 1">
          <label>ES título</label><input v-model="form.es.title" />
          <label>ES slug</label><input v-model="form.es.slug" />
        </div>
        <div style="flex: 1">
          <label>EN título</label><input v-model="form.en.title" />
          <label>EN slug</label><input v-model="form.en.slug" />
        </div>
      </div>
      <div class="row" style="margin-top: 0.75rem">
        <button class="primary" :disabled="!canSave" @click="save">Guardar</button>
        <button @click="cancelForm">Cancelar</button>
      </div>
    </div>

    <ConfirmModal
      :open="confirmOpen"
      title="Eliminar etiqueta"
      :message="pendingMessage"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </section>
</template>
