<script setup lang="ts">
/**
 * Posts list: shows every post with a visual "missing translation" indicator
 * for pieces not yet translated into every supported language. Create/edit open
 * the editor; delete requires the typed-word confirmation (posts are stored
 * content, per the monorepo's typed-confirmation rule).
 */
import { onMounted, ref } from 'vue';
import { api } from '../api';
import type { PostListItem } from '../types';
import ConfirmModal from '../components/ConfirmModal.vue';

const emit = defineEmits<{ create: []; edit: [id: string] }>();

const posts = ref<PostListItem[]>([]);
const pending = ref<PostListItem | null>(null);
const confirmOpen = ref(false);

async function load() {
  const res = await api.listPosts();
  posts.value = res.data?.posts ?? [];
}
onMounted(load);

function beginDelete(p: PostListItem) {
  pending.value = p;
  confirmOpen.value = true;
}
async function confirmDelete() {
  if (!pending.value) return;
  await api.deletePost(pending.value.id);
  confirmOpen.value = false;
  pending.value = null;
  await load();
}
</script>

<template>
  <section>
    <div class="row" style="justify-content: space-between">
      <h2>Posts</h2>
      <button class="primary" @click="emit('create')">Nuevo post</button>
    </div>

    <table>
      <thead>
        <tr><th>Título</th><th>Idioma</th><th>Categoría</th><th>Traducción</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="p in posts" :key="p.id">
          <td>{{ p.title }} <span class="muted">/{{ p.slug }}</span></td>
          <td>{{ p.lang.toUpperCase() }}</td>
          <td><code>{{ p.categoryId }}</code></td>
          <td>
            <span v-if="p.missingTranslations.length" class="badge warn">
              falta: {{ p.missingTranslations.join(', ').toUpperCase() }}
            </span>
            <span v-else class="badge">completa</span>
          </td>
          <td class="row">
            <button @click="emit('edit', p.id)">Editar</button>
            <button class="danger" @click="beginDelete(p)">Eliminar</button>
          </td>
        </tr>
      </tbody>
    </table>

    <ConfirmModal
      :open="confirmOpen"
      title="Eliminar post"
      :message="`Vas a eliminar «${pending?.title}». Esta acción no se puede deshacer.`"
      @confirm="confirmDelete"
      @cancel="confirmOpen = false"
    />
  </section>
</template>
