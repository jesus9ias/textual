<script setup lang="ts">
/**
 * Posts list: shows every post with a visual "missing translation" indicator
 * for pieces not yet translated into every supported language. Create/edit open
 * the editor; delete requires the typed-word confirmation (posts are stored
 * content, per the monorepo's typed-confirmation rule). Search, language/category
 * filters, and pagination are client-side over the full post list.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import type { Category, PostListItem } from '../types';
import ConfirmModal from '../components/ConfirmModal.vue';
import { addToast } from '../toast';

const emit = defineEmits<{ create: []; edit: [id: string] }>();

const posts = ref<PostListItem[]>([]);
const categories = ref<Category[]>([]);
const pending = ref<PostListItem | null>(null);
const confirmOpen = ref(false);

const search = ref('');
const filterLang = ref('');
const filterCategory = ref('');
const page = ref(1);
const pageSize = 6;

async function load() {
  const [p, c] = await Promise.all([api.listPosts(), api.listCategories()]);
  posts.value = p.data?.posts ?? [];
  categories.value = c.data?.categories ?? [];
}
onMounted(load);

function categoryLabel(id: string) {
  return categories.value.find((c) => c.id === id)?.es.title ?? id;
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return posts.value.filter((p) => {
    const matchesQ = !q || p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
    const matchesLang = !filterLang.value || p.lang.toUpperCase() === filterLang.value;
    const matchesCat = !filterCategory.value || p.categoryId === filterCategory.value;
    return matchesQ && matchesLang && matchesCat;
  });
});
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const currentPage = computed(() => Math.min(Math.max(1, page.value), totalPages.value));
const startIdx = computed(() => (currentPage.value - 1) * pageSize);
const paged = computed(() => filtered.value.slice(startIdx.value, startIdx.value + pageSize));
const rangeStart = computed(() => (filtered.value.length === 0 ? 0 : startIdx.value + 1));
const rangeEnd = computed(() => Math.min(startIdx.value + pageSize, filtered.value.length));

function resetPage() {
  page.value = 1;
}

function beginDelete(p: PostListItem) {
  pending.value = p;
  confirmOpen.value = true;
}
async function confirmDelete() {
  if (!pending.value) return;
  await api.deletePost(pending.value.id);
  confirmOpen.value = false;
  pending.value = null;
  addToast('Post eliminado', 'success');
  await load();
}
</script>

<template>
  <div>
    <div class="row-between">
      <h1>Posts</h1>
      <button class="primary" @click="emit('create')">+ Nuevo post</button>
    </div>

    <div class="toolbar">
      <div class="search-wrap">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="7" cy="7" r="5.2" fill="none" stroke="white" stroke-width="1.4"></circle>
          <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="white" stroke-width="1.4" stroke-linecap="round"></line>
        </svg>
        <input v-model="search" placeholder="Buscar por título o slug…" @input="resetPage" />
      </div>
      <select v-model="filterLang" @change="resetPage">
        <option value="">Todos los idiomas</option>
        <option value="ES">ES</option>
        <option value="EN">EN</option>
      </select>
      <select v-model="filterCategory" @change="resetPage">
        <option value="">Todas las categorías</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.es.title }}</option>
      </select>
    </div>

    <div class="panel">
      <div class="list-head" style="grid-template-columns: 1fr 90px 150px 140px 190px">
        <div>Título</div>
        <div>Idioma</div>
        <div>Categoría</div>
        <div>Traducción</div>
        <div style="text-align: right">Acciones</div>
      </div>

      <div
        v-for="p in paged"
        :key="p.id"
        class="list-row"
        style="grid-template-columns: 1fr 90px 150px 140px 190px"
      >
        <div class="title-cell">
          <div class="name">{{ p.title }}</div>
          <div class="sub">/{{ p.slug }}</div>
        </div>
        <div>
          <span class="badge" :class="p.lang.toUpperCase() === 'EN' ? 'lang-en' : 'lang-es'">
            {{ p.lang.toUpperCase() }}
          </span>
        </div>
        <div style="font-size: 13.5px; color: rgba(255, 255, 255, 0.65)">{{ categoryLabel(p.categoryId) }}</div>
        <div>
          <span class="badge" :class="p.missingTranslations.length ? 'warn' : 'ok'">
            {{ p.missingTranslations.length ? `Falta: ${p.missingTranslations.join(', ').toUpperCase()}` : 'Completa' }}
          </span>
        </div>
        <div class="row" style="justify-content: flex-end">
          <button @click="emit('edit', p.id)">Editar</button>
          <button class="danger" @click="beginDelete(p)">Eliminar</button>
        </div>
      </div>

      <div v-if="paged.length === 0" class="list-empty">No hay posts que coincidan con la búsqueda.</div>

      <div class="pagination">
        <div class="muted">Mostrando {{ rangeStart }}–{{ rangeEnd }} de {{ filtered.length }}</div>
        <div class="row">
          <button :disabled="currentPage <= 1" @click="page = currentPage - 1">← Anterior</button>
          <span class="pages">{{ currentPage }} / {{ totalPages }}</span>
          <button :disabled="currentPage >= totalPages" @click="page = currentPage + 1">Siguiente →</button>
        </div>
      </div>
    </div>

    <ConfirmModal
      :open="confirmOpen"
      title="Eliminar post"
      :message="`Vas a eliminar «${pending?.title}». Esta acción no se puede deshacer.`"
      @confirm="confirmDelete"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
