<script setup lang="ts">
/**
 * Post editor. Markdown editing with a split-view preview and an "open preview
 * in new tab" mode. The preview is rendered with a client-side Markdown library
 * inside a sandboxed iframe (no scripts, no innerHTML) — it is explicitly
 * approximate; the published HTML is produced by Astro at blog build time.
 *
 * Publish is gated on a cover image + non-empty alt text (mirroring the schema
 * requirement). Creating a post offers a translation-link selector limited to
 * pieces missing a version in the target language; linking copies that piece's
 * translationId, and a category mismatch raises a non-blocking warning.
 */
import { computed, onMounted, ref } from 'vue';
import MarkdownIt from 'markdown-it';
import { api } from '../api';
import type { Author, Category, PostListItem, PostPayload, Tag } from '../types';

const props = defineProps<{ postId?: string | null }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const md = new MarkdownIt({ html: false, linkify: true });

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): PostPayload => ({
  translationId: '',
  lang: 'es',
  slug: '',
  title: '',
  description: '',
  authorId: '',
  categoryId: '',
  tagIds: [],
  coverImage: { src: '', alt: '' },
  createdAt: today(),
  updatedAt: today(),
  published: true,
  body: '',
});

const post = ref<PostPayload>(blank());
const isEdit = computed(() => Boolean(props.postId));

const categories = ref<Category[]>([]);
const authors = ref<Author[]>([]);
const tags = ref<Tag[]>([]);
const allPosts = ref<PostListItem[]>([]);

const linkTo = ref('');
const showPreview = ref(true);
const error = ref('');
const saveWarning = ref(false);

onMounted(async () => {
  const [c, a, t, p] = await Promise.all([api.listCategories(), api.listAuthors(), api.listTags(), api.listPosts()]);
  categories.value = c.data?.categories ?? [];
  authors.value = a.data?.authors ?? [];
  tags.value = t.data?.tags ?? [];
  allPosts.value = p.data?.posts ?? [];

  if (props.postId) {
    const res = await api.getPost(props.postId);
    if (res.ok) post.value = { ...blank(), ...res.data.post };
  }
});

// Translation-link candidates: one existing post per translation group that
// does not yet have a version in the language being edited.
const candidates = computed<PostListItem[]>(() => {
  const groupsWithLang = new Set(
    allPosts.value.filter((p) => p.lang === post.value.lang).map((p) => p.translationId),
  );
  const seen = new Set<string>();
  return allPosts.value.filter((p) => {
    if (p.lang === post.value.lang || groupsWithLang.has(p.translationId) || seen.has(p.translationId)) return false;
    seen.add(p.translationId);
    return true;
  });
});
const linkedCandidate = computed(() => allPosts.value.find((p) => p.id === linkTo.value));
const categoryMismatch = computed(
  () => Boolean(linkedCandidate.value) && linkedCandidate.value!.categoryId !== post.value.categoryId,
);

const coverReady = computed(() => post.value.coverImage.src.trim() !== '' && post.value.coverImage.alt.trim() !== '');
const canPublish = computed(() => coverReady.value && post.value.title.trim() !== '' && post.value.slug.trim() !== '');

const previewDoc = computed(
  () =>
    `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:system-ui,sans-serif;max-width:70ch;margin:2rem auto;padding:0 1rem;color:#1a1a1a}img{max-width:100%}</style></head><body>${md.render(
      post.value.body,
    )}</body></html>`,
);

function openInNewTab() {
  const blob = new Blob([previewDoc.value], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function toggleTag(tagId: string) {
  const set = new Set(post.value.tagIds);
  if (set.has(tagId)) set.delete(tagId);
  else set.add(tagId);
  post.value.tagIds = [...set];
}

async function save() {
  error.value = '';
  saveWarning.value = false;
  post.value.updatedAt = today();
  const res = isEdit.value
    ? await api.updatePost(props.postId as string, post.value)
    : await api.createPost(post.value, linkTo.value || undefined);
  if (!res.ok) {
    error.value = (res.data as any)?.error ?? 'Error al guardar.';
    return;
  }
  if (!isEdit.value && (res.data as any)?.warning) saveWarning.value = true;
  emit('saved');
}
</script>

<template>
  <section>
    <div class="row" style="justify-content: space-between">
      <h2>{{ isEdit ? 'Editar post' : 'Nuevo post' }}</h2>
      <button @click="emit('cancel')">Volver</button>
    </div>
    <p v-if="error" class="warning">{{ error }}</p>

    <div class="row" style="gap: 1rem; align-items: flex-start">
      <!-- Left: form -->
      <div style="flex: 1; min-width: 0">
        <label>Idioma</label>
        <select v-model="post.lang" :disabled="isEdit">
          <option value="es">es</option>
          <option value="en">en</option>
        </select>

        <div v-if="!isEdit && candidates.length">
          <label>Es traducción de… (opcional)</label>
          <select v-model="linkTo">
            <option value="">— nueva pieza (nuevo translationId) —</option>
            <option v-for="c in candidates" :key="c.id" :value="c.id">
              {{ c.title }} ({{ c.lang.toUpperCase() }})
            </option>
          </select>
          <p v-if="categoryMismatch" class="warning">
            La traducción enlazada tiene otra categoría. Puedes guardar igualmente (aviso no bloqueante).
          </p>
        </div>

        <label>Título</label><input v-model="post.title" />
        <label>Slug</label><input v-model="post.slug" />
        <label>Descripción (máx. 160)</label><input v-model="post.description" maxlength="160" />

        <label>Categoría</label>
        <select v-model="post.categoryId">
          <option value="" disabled>Elegir…</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.es.title }}</option>
        </select>

        <label>Autor</label>
        <select v-model="post.authorId">
          <option value="" disabled>Elegir…</option>
          <option v-for="a in authors" :key="a.id" :value="a.id">{{ a.es.name }}</option>
        </select>

        <label>Etiquetas</label>
        <div class="row" style="flex-wrap: wrap">
          <label v-for="t in tags" :key="t.id" class="row" style="width: auto; margin: 0.15rem 0.5rem 0.15rem 0">
            <input type="checkbox" style="width: auto" :checked="post.tagIds.includes(t.id)" @change="toggleTag(t.id)" />
            {{ t.es.title }}
          </label>
        </div>

        <label>Imagen de portada (src)</label><input v-model="post.coverImage.src" placeholder="/assets/posts/…/cover.jpg" />
        <label>Texto alternativo de la portada</label><input v-model="post.coverImage.alt" />

        <label class="row" style="margin-top: 0.5rem">
          <input type="checkbox" v-model="post.published" style="width: auto" /> Publicado
        </label>
      </div>

      <!-- Right: markdown + preview -->
      <div style="flex: 1; min-width: 0">
        <div class="row" style="justify-content: space-between">
          <label style="margin: 0">Contenido (Markdown)</label>
          <div class="row">
            <label class="row" style="width: auto; margin: 0">
              <input type="checkbox" v-model="showPreview" style="width: auto" /> Preview
            </label>
            <button @click="openInNewTab">Abrir preview en pestaña</button>
          </div>
        </div>
        <textarea v-model="post.body" rows="16"></textarea>
        <div v-if="showPreview">
          <p class="muted">Preview aproximado — el HTML publicado lo genera Astro al construir el blog.</p>
          <iframe :srcdoc="previewDoc" sandbox="" class="preview" title="preview"></iframe>
        </div>
      </div>
    </div>

    <div class="card" style="position: sticky; bottom: 0">
      <p v-if="!coverReady" class="muted">Se requiere imagen de portada y texto alternativo para publicar.</p>
      <div class="row">
        <button class="primary" :disabled="!canPublish" @click="save">{{ isEdit ? 'Guardar' : 'Publicar' }}</button>
        <button @click="emit('cancel')">Cancelar</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.preview {
  width: 100%;
  height: 320px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
}
textarea {
  font-family: ui-monospace, monospace;
}
</style>
