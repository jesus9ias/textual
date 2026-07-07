<script setup lang="ts">
/**
 * Categories view: list/create/edit/delete. Deletion is blocked while the
 * category is referenced — the affected count is shown and a bulk-reassignment
 * flow (pick a replacement, apply to all affected posts) must run before the
 * typed-word confirmation delete becomes available. Changing a slug requires a
 * distinct confirmation warning that published URLs will change.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import type { Category } from '../types';
import ConfirmModal from '../components/ConfirmModal.vue';

const categories = ref<Category[]>([]);
const error = ref('');

const emptyForm = (): Category & { mode: 'create' | 'edit' | null; originalEsSlug: string; originalEnSlug: string } => ({
  mode: null,
  id: '',
  es: { slug: '', title: '', description: '' },
  en: { slug: '', title: '', description: '' },
  originalEsSlug: '',
  originalEnSlug: '',
});
const form = ref(emptyForm());
const slugAckTyped = ref('');

// Delete / reassignment state.
const pending = ref<Category | null>(null);
const usageCount = ref(0);
const usagePosts = ref<string[]>([]);
const reassignTo = ref('');
const confirmOpen = ref(false);

async function load() {
  const res = await api.listCategories();
  categories.value = res.data?.categories ?? [];
}
onMounted(load);

const slugChanged = computed(
  () =>
    form.value.mode === 'edit' &&
    (form.value.es.slug !== form.value.originalEsSlug || form.value.en.slug !== form.value.originalEnSlug),
);
const canSave = computed(() => form.value.id && form.value.es.title && form.value.en.title && (!slugChanged.value || slugAckTyped.value === 'confirmar'));

function startCreate() {
  form.value = { ...emptyForm(), mode: 'create' };
  slugAckTyped.value = '';
}
function startEdit(cat: Category) {
  form.value = {
    mode: 'edit',
    id: cat.id,
    es: { ...cat.es },
    en: { ...cat.en },
    originalEsSlug: cat.es.slug,
    originalEnSlug: cat.en.slug,
  };
  slugAckTyped.value = '';
}
function cancelForm() {
  form.value = emptyForm();
}

async function save() {
  error.value = '';
  const body: Category = { id: form.value.id, es: form.value.es, en: form.value.en };
  const res = form.value.mode === 'create' ? await api.createCategory(body) : await api.updateCategory(body.id, body);
  if (!res.ok) {
    error.value = res.data?.error ?? 'Error al guardar.';
    return;
  }
  cancelForm();
  await load();
}

async function beginDelete(cat: Category) {
  pending.value = cat;
  reassignTo.value = '';
  const res = await api.categoryUsage(cat.id);
  usageCount.value = res.data?.usageCount ?? 0;
  usagePosts.value = res.data?.posts ?? [];
  if (usageCount.value === 0) confirmOpen.value = true;
}

async function reassignAll() {
  if (!pending.value || !reassignTo.value) return;
  for (const postId of usagePosts.value) {
    const read = await api.getPost(postId);
    if (!read.ok) continue;
    await api.updatePost(postId, { ...read.data.post, categoryId: reassignTo.value });
  }
  // Re-check: once nothing references it, deletion is unblocked.
  const res = await api.categoryUsage(pending.value.id);
  usageCount.value = res.data?.usageCount ?? 0;
  usagePosts.value = res.data?.posts ?? [];
  if (usageCount.value === 0) confirmOpen.value = true;
}

async function confirmDelete() {
  if (!pending.value) return;
  await api.deleteCategory(pending.value.id);
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

const replacements = computed(() => categories.value.filter((c) => c.id !== pending.value?.id));
</script>

<template>
  <section>
    <div class="row" style="justify-content: space-between">
      <h2>Categorías</h2>
      <button class="primary" @click="startCreate">Nueva categoría</button>
    </div>
    <p v-if="error" class="warning">{{ error }}</p>

    <table>
      <thead>
        <tr><th>id</th><th>ES</th><th>EN</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="c in categories" :key="c.id">
          <td><code>{{ c.id }}</code></td>
          <td>{{ c.es.title }} <span class="muted">/{{ c.es.slug }}</span></td>
          <td>{{ c.en.title }} <span class="muted">/{{ c.en.slug }}</span></td>
          <td class="row">
            <button @click="startEdit(c)">Editar</button>
            <button class="danger" @click="beginDelete(c)">Eliminar</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Create / edit form -->
    <div v-if="form.mode" class="card">
      <h3>{{ form.mode === 'create' ? 'Nueva categoría' : `Editar ${form.id}` }}</h3>
      <label>id (slug interno)</label>
      <input v-model="form.id" :disabled="form.mode === 'edit'" placeholder="p.ej. fisica" />
      <div class="row" style="gap: 1rem; align-items: flex-start">
        <div style="flex: 1">
          <label>ES título</label><input v-model="form.es.title" />
          <label>ES slug</label><input v-model="form.es.slug" />
          <label>ES descripción</label><input v-model="form.es.description" />
        </div>
        <div style="flex: 1">
          <label>EN título</label><input v-model="form.en.title" />
          <label>EN slug</label><input v-model="form.en.slug" />
          <label>EN descripción</label><input v-model="form.en.description" />
        </div>
      </div>

      <div v-if="slugChanged" class="warning">
        Cambiar el slug modificará URLs ya publicadas e indexadas. Escribe <strong>confirmar</strong> para aceptar el cambio.
        <input v-model="slugAckTyped" autocomplete="off" style="margin-top: 0.4rem" />
      </div>

      <div class="row" style="margin-top: 0.75rem">
        <button class="primary" :disabled="!canSave" @click="save">Guardar</button>
        <button @click="cancelForm">Cancelar</button>
      </div>
    </div>

    <!-- Reassignment (deletion blocked while referenced) -->
    <div v-if="pending && usageCount > 0" class="card">
      <h3>No se puede eliminar «{{ pending.id }}»</h3>
      <p class="warning">{{ usageCount }} posts referencian esta categoría. Reasígnalos antes de eliminar.</p>
      <label>Reasignar todos a</label>
      <select v-model="reassignTo">
        <option value="" disabled>Elegir categoría…</option>
        <option v-for="r in replacements" :key="r.id" :value="r.id">{{ r.es.title }}</option>
      </select>
      <div class="row" style="margin-top: 0.75rem">
        <button class="primary" :disabled="!reassignTo" @click="reassignAll">Reasignar {{ usageCount }} posts</button>
        <button @click="cancelDelete">Cancelar</button>
      </div>
    </div>

    <ConfirmModal
      :open="confirmOpen"
      title="Eliminar categoría"
      :message="`Vas a eliminar «${pending?.id}». Esta acción no se puede deshacer.`"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </section>
</template>
