<script setup lang="ts">
/**
 * Authors view: list/create/edit/delete. Like categories, deletion is blocked
 * while referenced; the affected count is shown and a bulk-reassignment to
 * another author must run before the typed-word confirmation delete. The panel
 * supports multiple authors from the start.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import type { Author } from '../types';
import ConfirmModal from '../components/ConfirmModal.vue';

const authors = ref<Author[]>([]);
const error = ref('');

const emptyForm = (): Author & { mode: 'create' | 'edit' | null } => ({
  mode: null,
  id: '',
  es: { name: '', bio: '', avatar: '' },
  en: { name: '', bio: '', avatar: '' },
  social: {},
});
const form = ref(emptyForm());

const pending = ref<Author | null>(null);
const usageCount = ref(0);
const usagePosts = ref<string[]>([]);
const reassignTo = ref('');
const confirmOpen = ref(false);

async function load() {
  const res = await api.listAuthors();
  authors.value = res.data?.authors ?? [];
}
onMounted(load);

const canSave = computed(() => form.value.id && form.value.es.name && form.value.en.name);

function startCreate() {
  form.value = { ...emptyForm(), mode: 'create' };
}
function startEdit(a: Author) {
  form.value = { mode: 'edit', id: a.id, es: { ...a.es }, en: { ...a.en }, social: { ...a.social } };
}
function cancelForm() {
  form.value = emptyForm();
}

async function save() {
  error.value = '';
  const body: Author = { id: form.value.id, es: form.value.es, en: form.value.en, social: form.value.social };
  const res = form.value.mode === 'create' ? await api.createAuthor(body) : await api.updateAuthor(body.id, body);
  if (!res.ok) {
    error.value = res.data?.error ?? 'Error al guardar.';
    return;
  }
  cancelForm();
  await load();
}

async function beginDelete(a: Author) {
  pending.value = a;
  reassignTo.value = '';
  const res = await api.authorUsage(a.id);
  usageCount.value = res.data?.usageCount ?? 0;
  usagePosts.value = res.data?.posts ?? [];
  if (usageCount.value === 0) confirmOpen.value = true;
}

async function reassignAll() {
  if (!pending.value || !reassignTo.value) return;
  for (const postId of usagePosts.value) {
    const read = await api.getPost(postId);
    if (!read.ok) continue;
    await api.updatePost(postId, { ...read.data.post, authorId: reassignTo.value });
  }
  const res = await api.authorUsage(pending.value.id);
  usageCount.value = res.data?.usageCount ?? 0;
  usagePosts.value = res.data?.posts ?? [];
  if (usageCount.value === 0) confirmOpen.value = true;
}

async function confirmDelete() {
  if (!pending.value) return;
  await api.deleteAuthor(pending.value.id);
  confirmOpen.value = false;
  cancelDelete();
  await load();
}
function cancelDelete() {
  pending.value = null;
  confirmOpen.value = false;
  usageCount.value = 0;
  usagePosts.value = [];
}

const replacements = computed(() => authors.value.filter((a) => a.id !== pending.value?.id));
</script>

<template>
  <section>
    <div class="row" style="justify-content: space-between">
      <h2>Autores</h2>
      <button class="primary" @click="startCreate">Nuevo autor</button>
    </div>
    <p v-if="error" class="warning">{{ error }}</p>

    <table>
      <thead>
        <tr><th>id</th><th>ES</th><th>EN</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="a in authors" :key="a.id">
          <td><code>{{ a.id }}</code></td>
          <td>{{ a.es.name }}</td>
          <td>{{ a.en.name }}</td>
          <td class="row">
            <button @click="startEdit(a)">Editar</button>
            <button class="danger" @click="beginDelete(a)">Eliminar</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="form.mode" class="card">
      <h3>{{ form.mode === 'create' ? 'Nuevo autor' : `Editar ${form.id}` }}</h3>
      <label>id</label>
      <input v-model="form.id" :disabled="form.mode === 'edit'" placeholder="p.ej. ignacio-garza" />
      <div class="row" style="gap: 1rem; align-items: flex-start">
        <div style="flex: 1">
          <label>ES nombre</label><input v-model="form.es.name" />
          <label>ES bio</label><input v-model="form.es.bio" />
          <label>ES avatar</label><input v-model="form.es.avatar" />
        </div>
        <div style="flex: 1">
          <label>EN nombre</label><input v-model="form.en.name" />
          <label>EN bio</label><input v-model="form.en.bio" />
          <label>EN avatar</label><input v-model="form.en.avatar" />
        </div>
      </div>
      <div class="row" style="margin-top: 0.75rem">
        <button class="primary" :disabled="!canSave" @click="save">Guardar</button>
        <button @click="cancelForm">Cancelar</button>
      </div>
    </div>

    <div v-if="pending && usageCount > 0" class="card">
      <h3>No se puede eliminar «{{ pending.id }}»</h3>
      <p class="warning">{{ usageCount }} posts referencian este autor. Reasígnalos antes de eliminar.</p>
      <label>Reasignar todos a</label>
      <select v-model="reassignTo">
        <option value="" disabled>Elegir autor…</option>
        <option v-for="r in replacements" :key="r.id" :value="r.id">{{ r.es.name }}</option>
      </select>
      <div class="row" style="margin-top: 0.75rem">
        <button class="primary" :disabled="!reassignTo" @click="reassignAll">Reasignar {{ usageCount }} posts</button>
        <button @click="cancelDelete">Cancelar</button>
      </div>
    </div>

    <ConfirmModal
      :open="confirmOpen"
      title="Eliminar autor"
      :message="`Vas a eliminar «${pending?.id}». Esta acción no se puede deshacer.`"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </section>
</template>
