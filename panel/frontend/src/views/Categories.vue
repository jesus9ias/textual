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
import { addToast } from '../toast';

const categories = ref<Category[]>([]);
const error = ref('');
const search = ref('');

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

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return categories.value;
  return categories.value.filter((c) => c.es.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
});

const slugChanged = computed(
  () =>
    form.value.mode === 'edit' &&
    (form.value.es.slug !== form.value.originalEsSlug || form.value.en.slug !== form.value.originalEnSlug),
);
const canSave = computed(
  () => form.value.id && form.value.es.title && form.value.en.title && (!slugChanged.value || slugAckTyped.value === 'confirmar'),
);

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
  addToast('Categoría guardada', 'success');
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
  // Re-check: once nothing references it, deletion is unblocked (still gated
  // behind the typed "eliminar" confirmation below).
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
  addToast('Categoría eliminada', 'success');
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
  <div>
    <div class="row-between">
      <h1>Categorías</h1>
      <button class="primary" @click="startCreate">+ Nueva categoría</button>
    </div>
    <p v-if="error" class="warning">{{ error }}</p>

    <div class="search-wrap" style="max-width: 340px; margin-bottom: 18px">
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="5.2" fill="none" stroke="white" stroke-width="1.4"></circle>
        <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="white" stroke-width="1.4" stroke-linecap="round"></line>
      </svg>
      <input v-model="search" placeholder="Buscar categoría…" />
    </div>

    <div class="panel">
      <div class="list-head" style="grid-template-columns: 150px 1fr 1fr 190px">
        <div>ID</div>
        <div>ES</div>
        <div>EN</div>
        <div style="text-align: right">Acciones</div>
      </div>

      <div v-for="c in filtered" :key="c.id" class="list-row" style="grid-template-columns: 150px 1fr 1fr 190px">
        <div><span class="id-chip">{{ c.id }}</span></div>
        <div class="title-cell">
          <div class="name" style="font-size: 14.5px">{{ c.es.title }}</div>
          <div class="sub">/{{ c.es.slug }}</div>
        </div>
        <div class="title-cell">
          <div class="name" style="font-size: 14.5px">{{ c.en.title }}</div>
          <div class="sub">/{{ c.en.slug }}</div>
        </div>
        <div class="row" style="justify-content: flex-end">
          <button @click="startEdit(c)">Editar</button>
          <button class="danger" @click="beginDelete(c)">Eliminar</button>
        </div>
      </div>

      <div v-if="filtered.length === 0" class="list-empty">No hay categorías que coincidan con la búsqueda.</div>
    </div>

    <!-- Create / edit modal -->
    <div v-if="form.mode" class="modal-overlay" @click.self="cancelForm">
      <div class="modal wide">
        <h2 style="margin-bottom: 18px">{{ form.mode === 'create' ? 'Nueva categoría' : `Editar ${form.id}` }}</h2>

        <div class="field">
          <label style="text-transform: none; color: rgba(255, 255, 255, 0.45); font-weight: 400">id (slug interno)</label>
          <input v-model="form.id" :disabled="form.mode === 'edit'" placeholder="p.ej. fisica" class="mono" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px">
          <div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">ES título</label>
              <input v-model="form.es.title" />
            </div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">ES slug</label>
              <input v-model="form.es.slug" class="mono" />
            </div>
            <div class="field" style="margin-bottom: 0">
              <label style="color: rgba(147, 183, 255, 0.85)">ES descripción</label>
              <input v-model="form.es.description" />
            </div>
          </div>
          <div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">EN título</label>
              <input v-model="form.en.title" />
            </div>
            <div class="field">
              <label style="color: rgba(147, 183, 255, 0.85)">EN slug</label>
              <input v-model="form.en.slug" class="mono" />
            </div>
            <div class="field" style="margin-bottom: 0">
              <label style="color: rgba(147, 183, 255, 0.85)">EN descripción</label>
              <input v-model="form.en.description" />
            </div>
          </div>
        </div>

        <div v-if="slugChanged" class="warning">
          Cambiar el slug modificará URLs ya publicadas e indexadas. Escribe <strong>confirmar</strong> para aceptar el cambio.
          <input v-model="slugAckTyped" autocomplete="off" style="margin-top: 8px" />
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
        <div class="warning">{{ usageCount }} posts referencian esta categoría. Reasígnalos antes de eliminar.</div>
        <div class="field" style="margin-top: 14px">
          <label style="text-transform: none; color: rgba(255, 255, 255, 0.5); font-weight: 400">Reasignar todos a</label>
          <select v-model="reassignTo">
            <option value="" disabled>Elegir categoría…</option>
            <option v-for="r in replacements" :key="r.id" :value="r.id">{{ r.es.title }}</option>
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
      title="Eliminar categoría"
      :message="`Vas a eliminar «${pending?.id}». Esta acción no se puede deshacer.`"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>
