<script setup lang="ts">
/** Panel shell: tab navigation across the content views, plus the post editor. */
import { ref } from 'vue';
import PostsList from './views/PostsList.vue';
import PostEditor from './views/PostEditor.vue';
import Categories from './views/Categories.vue';
import Tags from './views/Tags.vue';
import Authors from './views/Authors.vue';
import ToastStack from './components/ToastStack.vue';

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
  <div class="topbar-outer">
    <div class="topbar">
      <div class="brand"><span class="dot"></span>Textual · Panel</div>
      <nav class="nav-pills">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="nav-pill"
          :class="{ active: view === tab.key || (view === 'editor' && tab.key === 'posts') }"
          @click="view = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>
  </div>

  <main>
    <PostsList v-if="view === 'posts'" @create="openEditor(null)" @edit="openEditor($event)" />
    <PostEditor v-else-if="view === 'editor'" :post-id="editingPostId" @saved="closeEditor" @cancel="closeEditor" />
    <Categories v-else-if="view === 'categories'" />
    <Tags v-else-if="view === 'tags'" />
    <Authors v-else-if="view === 'authors'" />
  </main>

  <ToastStack />
</template>
