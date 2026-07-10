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
import { addToast } from '../toast';

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
const descRemaining = computed(() => 160 - post.value.description.length);

const previewDoc = computed(
  () =>
    `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:system-ui,sans-serif;max-width:70ch;margin:2rem auto;padding:0 1rem;color:rgba(255,255,255,0.85);background:#0d1220}a{color:#93b7ff}img{max-width:100%}</style></head><body>${md.render(
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
  post.value.updatedAt = today();
  const res = isEdit.value
    ? await api.updatePost(props.postId as string, post.value)
    : await api.createPost(post.value, linkTo.value || undefined);
  if (!res.ok) {
    error.value = (res.data as any)?.error ?? 'Error al guardar.';
    return;
  }
  addToast(isEdit.value ? 'Post actualizado' : 'Post creado', 'success');
  emit('saved');
}
</script>

<template>
  <div>
    <div class="row-between">
      <h1>{{ isEdit ? 'Editar post' : 'Nuevo post' }}</h1>
      <button @click="emit('cancel')">Volver</button>
    </div>
    <p v-if="error" class="warning">{{ error }}</p>

    <div style="display: grid; grid-template-columns: 1fr 1.1fr; gap: 20px; align-items: start">
      <!-- Left: form -->
      <div class="panel panel-pad" style="display: flex; flex-direction: column; gap: 16px">
        <div class="field">
          <label>Idioma</label>
          <select v-model="post.lang" :disabled="isEdit">
            <option value="es">es</option>
            <option value="en">en</option>
          </select>
        </div>

        <div v-if="!isEdit && candidates.length" class="field">
          <label>Es traducción de… (opcional)</label>
          <select v-model="linkTo">
            <option value="">— nueva pieza (nuevo translationId) —</option>
            <option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.title }} ({{ c.lang.toUpperCase() }})</option>
          </select>
          <p v-if="categoryMismatch" class="warning">
            La traducción enlazada tiene otra categoría. Puedes guardar igualmente (aviso no bloqueante).
          </p>
        </div>

        <div class="field">
          <label style="text-transform: none; font-weight: 700; color: rgba(255, 255, 255, 0.85)">Título</label>
          <input v-model="post.title" />
        </div>

        <div class="field">
          <label>Slug</label>
          <input v-model="post.slug" class="mono" />
        </div>

        <div class="field">
          <div class="field-row">
            <label style="margin-bottom: 0">Descripción</label>
            <span class="hint">{{ descRemaining }} restantes</span>
          </div>
          <textarea v-model="post.description" maxlength="160" rows="2"></textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
          <div class="field" style="margin-bottom: 0">
            <label>Categoría</label>
            <select v-model="post.categoryId">
              <option value="" disabled>Elegir…</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.es.title }}</option>
            </select>
          </div>
          <div class="field" style="margin-bottom: 0">
            <label>Autor</label>
            <select v-model="post.authorId">
              <option value="" disabled>Elegir…</option>
              <option v-for="a in authors" :key="a.id" :value="a.id">{{ a.es.name }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>Etiquetas</label>
          <div style="display: flex; flex-wrap: wrap; gap: 8px">
            <button
              v-for="t in tags"
              :key="t.id"
              type="button"
              class="tag-toggle"
              :class="{ active: post.tagIds.includes(t.id) }"
              @click="toggleTag(t.id)"
            >
              {{ t.es.title }}
            </button>
          </div>
        </div>

        <div class="field">
          <label>Imagen de portada (src)</label>
          <input v-model="post.coverImage.src" placeholder="/assets/posts/…/cover.jpg" />
        </div>

        <div class="field" style="margin-bottom: 0">
          <label>Texto alternativo de portada</label>
          <input v-model="post.coverImage.alt" />
        </div>

        <div
          style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 12px 16px;
          "
        >
          <span style="font-size: 13.5px; font-weight: 600; color: rgba(255, 255, 255, 0.8)">Publicado</span>
          <button
            type="button"
            class="toggle"
            :class="{ on: post.published }"
            style="border: 1px solid; padding: 2px"
            @click="post.published = !post.published"
          >
            <span class="knob"></span>
          </button>
        </div>

        <p v-if="!coverReady" class="warning" style="margin: 0">
          Se requiere imagen de portada y texto alternativo para publicar.
        </p>

        <div style="display: flex; gap: 10px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08)">
          <button class="primary" :disabled="!canPublish" @click="save">{{ isEdit ? 'Guardar' : 'Publicar' }}</button>
          <button @click="emit('cancel')">Cancelar</button>
        </div>
      </div>

      <!-- Right: markdown + preview -->
      <div style="display: flex; flex-direction: column; gap: 16px">
        <div class="panel" style="padding: 18px">
          <div class="row-between" style="margin-bottom: 12px">
            <label style="margin-bottom: 0">Contenido (Markdown)</label>
            <div class="row" style="gap: 12px">
              <label
                class="row"
                style="width: auto; margin-bottom: 0; text-transform: none; font-weight: 400; color: rgba(255, 255, 255, 0.7); font-size: 13px"
              >
                <input type="checkbox" v-model="showPreview" style="width: auto; accent-color: #4f8cff" /> Preview
              </label>
              <button @click="openInNewTab">Abrir preview en pestaña</button>
            </div>
          </div>
          <textarea
            v-model="post.body"
            rows="12"
            class="mono"
            placeholder="Escribe en Markdown…"
            style="background: rgba(0, 0, 0, 0.22)"
          ></textarea>
        </div>

        <div v-if="showPreview" class="panel panel-pad">
          <div class="muted" style="margin-bottom: 14px">
            Preview aproximado — el HTML publicado lo genera Astro al construir el blog.
          </div>
          <iframe :srcdoc="previewDoc" sandbox="" class="preview-frame" title="preview"></iframe>
        </div>
      </div>
    </div>
  </div>
</template>
