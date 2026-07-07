<script setup lang="ts">
/** Panel shell: tab navigation across the content views, plus the post editor. */
import { ref } from 'vue';
import PostsList from './views/PostsList.vue';
import PostEditor from './views/PostEditor.vue';
import Categories from './views/Categories.vue';
import Tags from './views/Tags.vue';
import Authors from './views/Authors.vue';

type View = 'posts' | 'categories' | 'tags' | 'authors' | 'editor';

const view = ref<View>('posts');
const editingPostId = ref<string | null>(null);

function openEditor(id: string | null) {
  editingPostId.value = id;
  view.value = 'editor';
}
function closeEditor() {
  editingPostId.value = null;
  view.value = 'posts';
}

const tabs: { key: View; label: string }[] = [
  { key: 'posts', label: 'Posts' },
  { key: 'categories', label: 'Categorías' },
  { key: 'tags', label: 'Etiquetas' },
  { key: 'authors', label: 'Autores' },
];
</script>

<template>
  <header class="topbar">
    <strong>Textual · Panel</strong>
    <nav class="row">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="{ primary: view === tab.key }"
        @click="view = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>
  </header>

  <main>
    <PostsList v-if="view === 'posts'" @create="openEditor(null)" @edit="openEditor($event)" />
    <PostEditor v-else-if="view === 'editor'" :post-id="editingPostId" @saved="closeEditor" @cancel="closeEditor" />
    <Categories v-else-if="view === 'categories'" />
    <Tags v-else-if="view === 'tags'" />
    <Authors v-else-if="view === 'authors'" />
  </main>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 5;
}
main {
  max-width: 70rem;
  margin: 1.5rem auto;
  padding: 0 1.5rem;
}
</style>
