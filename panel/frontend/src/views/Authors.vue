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
import type { PostListItem } from '../types';
import ConfirmModal from '../components/ConfirmModal.vue';
import { addToast } from '../toast';

const authors = ref<Author[]>([]);
const posts = ref<PostListItem[]>([]);
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
  const [a, p] = await Promise.all([api.listAuthors(), api.listPosts()]);
  authors.value = a.data?.authors ?? [];
  posts.value = p.data?.posts ?? [];
}
onMounted(load);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
const countOf = (authorId: string) => posts.value.filter((p) => p.authorId === authorId).length;
const authorsProcessed = computed(() => authors.value.map((a) => ({ ...a, count: countOf(a.id) })));

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
  addToast('Autor guardado', 'success');
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
  addToast('Autor eliminado', 'success');
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
  <div>
    <div class="row-between">
      <h1>Autores</h1>
      <button class="primary" @click="startCreate">+ Nuevo autor</button>
    </div>
    <p v-if="error" class="warning">{{ error }}</p>

    <div class="card-grid">
      <div v-for="a in authorsProcessed" :key="a.id" class="author-card">
        <div class="avatar">{{ initials(a.es.name) }}</div>
        <div style="flex: 1; min-width: 0">
          <div style="font-size: 15px; font-weight: 600">{{ a.es.name }}</div>
          <div class="hint" style="margin-top: 2px">{{ a.id }} · {{ a.count }} posts</div>
          <div class="row" style="margin-top: 10px">
            <button @click="startEdit(a)">Editar</button>
            <button class="danger" @click="beginDelete(a)">Eliminar</button>
          </div>
        </div>
      </div>
      <div v-if="authorsProcessed.length === 0" class="muted">Aún no hay autores.</div>
    </div>

    <!-- Create / edit modal -->
    <div v-if="form.mode" class="modal-overlay" @click.self="cancelForm">
      <div class="modal wide">
        <h2 style="margin-bottom: 18px">{{ form.mode === 'create' ? 'Nuevo autor' : `Editar ${form.id}` }}</h2>

        <div class="field">
          <label style="text-transform: none; color: rgba(255, 255, 255, 0.45); font-weight: 400">id</label>
          <input v-model="form.id" :disabled="form.mode === 'edit'" placeholder="p.ej. ignacio-garza" class="mono" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px">
          <div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">ES nombre</label>
              <input v-model="form.es.name" />
            </div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">ES bio</label>
              <input v-model="form.es.bio" />
            </div>
            <div class="field" style="margin-bottom: 0">
              <label style="color: rgba(147, 183, 255, 0.85)">ES avatar</label>
              <input v-model="form.es.avatar" />
            </div>
          </div>
          <div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">EN nombre</label>
              <input v-model="form.en.name" />
            </div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">EN bio</label>
              <input v-model="form.en.bio" />
            </div>
            <div class="field" style="margin-bottom: 0">
              <label style="color: rgba(147, 183, 255, 0.85)">EN avatar</label>
              <input v-model="form.en.avatar" />
            </div>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 20px">
          <button @click="cancelForm">Cancelar</button>
          <button class="primary" :disabled="!canSave" @click="save">Guardar</button>
        </div>
      </div>
    </div>

    <!-- Reassignment (deletion blocked while referenced) -->
    <div v-if="pending && usageCount > 0" class="modal-overlay" @click.self="cancelDelete">
      <div class="modal">
        <h2 style="margin-bottom: 16px">No se puede eliminar «{{ pending.id }}»</h2>
        <div class="warning">{{ usageCount }} posts referencian este autor. Reasígnalos antes de eliminar.</div>
        <div class="field" style="margin-top: 14px">
          <label style="text-transform: none; color: rgba(255, 255, 255, 0.5); font-weight: 400">Reasignar todos a</label>
          <select v-model="reassignTo">
            <option value="" disabled>Elegir autor…</option>
            <option v-for="r in replacements" :key="r.id" :value="r.id">{{ r.es.name }}</option>
          </select>
        </div>
        <div class="modal-actions">
          <button @click="cancelDelete">Cancelar</button>
          <button class="primary" :disabled="!reassignTo" @click="reassignAll">Reasignar {{ usageCount }} posts</button>
        </div>
      </div>
    </div>

    <ConfirmModal
      :open="confirmOpen"
      title="Eliminar autor"
      :message="`Vas a eliminar «${pending?.id}». Esta acción no se puede deshacer.`"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>
