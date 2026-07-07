/**
 * Content store: the panel's only read/write path to the blog content on disk.
 * Every mutating method runs the request through `integrity.ts` before touching
 * the filesystem via `fsWriter.ts`. Pure integrity logic stays in `integrity.ts`;
 * this module adds the I/O (reading the current content, persisting changes).
 */
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  validatePostFields,
  validatePostWrite,
  canDeleteCategory,
  canDeleteAuthor,
  planTagDeletion,
  checkTranslationCategory,
  generateTranslationId,
} from './integrity.ts';
import { dataFilePath, writeFileAtomic, writePostFile } from './fsWriter.ts';
import type { ContentSnapshot, PostFrontmatter, PostPayload, PostRef } from './types.ts';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const TAXONOMIES = ['categories', 'tags', 'authors'] as const;
type Taxonomy = (typeof TAXONOMIES)[number];

interface PostFile {
  filePath: string;
  id: string;
  frontmatter: PostFrontmatter;
  body: string;
}

export interface PostListItem {
  id: string;
  translationId: string;
  lang: string;
  slug: string;
  title: string;
  categoryId: string;
  authorId: string;
  tagIds: string[];
  published: boolean;
  missingTranslations: string[];
}

export type CreatePostResult =
  | { ok: true; id: string; translationId: string; warning: boolean }
  | { ok: false; status: number; error: string };

export type DeleteResult =
  | { ok: true; usageCount?: number }
  | { ok: false; status: number; usageCount?: number; error?: string };

export type TaxonomyResult = { ok: true; id: string } | { ok: false; status: number; error: string };

export interface Store {
  listPosts(): Promise<PostListItem[]>;
  getPost(id: string): Promise<(PostFrontmatter & { body: string }) | null>;
  createPost(input: { payload: PostPayload; linkTo?: string }): Promise<CreatePostResult>;
  updatePost(id: string, payload: PostPayload): Promise<CreatePostResult>;
  deletePost(id: string): Promise<DeleteResult>;

  listCategories(): Promise<Array<Record<string, unknown>>>;
  createCategory(body: any): Promise<TaxonomyResult>;
  updateCategory(id: string, body: any): Promise<TaxonomyResult>;
  deleteCategory(id: string): Promise<DeleteResult>;
  categoryUsage(id: string): Promise<{ usageCount: number; posts: string[] }>;

  listTags(): Promise<Array<Record<string, unknown>>>;
  createTag(body: any): Promise<TaxonomyResult>;
  updateTag(id: string, body: any): Promise<TaxonomyResult>;
  deleteTag(id: string): Promise<DeleteResult>;

  listAuthors(): Promise<Array<Record<string, unknown>>>;
  createAuthor(body: any): Promise<TaxonomyResult>;
  updateAuthor(id: string, body: any): Promise<TaxonomyResult>;
  deleteAuthor(id: string): Promise<DeleteResult>;
  authorUsage(id: string): Promise<{ usageCount: number; posts: string[] }>;
}

export function createStore({ contentRoot, configRoot }: { contentRoot: string; configRoot: string }): Store {
  const postId = (fm: { lang: string; slug: string }) => `${fm.lang}:${fm.slug}`;

  async function walk(dir: string): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const found: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) found.push(...(await walk(full)));
      else if (entry.name.endsWith('.md')) found.push(full);
    }
    return found;
  }

  async function readAllPosts(): Promise<PostFile[]> {
    const files = await walk(path.join(contentRoot, 'posts'));
    const posts: PostFile[] = [];
    for (const filePath of files) {
      const text = await readFile(filePath, 'utf8');
      const match = FRONTMATTER.exec(text);
      const frontmatter = (match ? parseYaml(match[1]) : {}) as unknown as PostFrontmatter;
      const body = match ? match[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '') : '';
      posts.push({ filePath, frontmatter, body, id: postId(frontmatter) });
    }
    return posts;
  }

  async function readTaxonomy(collection: Taxonomy): Promise<Array<{ id: string; data: any }>> {
    const dir = path.join(contentRoot, collection);
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const out = [];
    for (const file of files) {
      out.push({ id: file.replace(/\.json$/, ''), data: JSON.parse(await readFile(path.join(dir, file), 'utf8')) });
    }
    return out;
  }

  const toPostRef = (p: PostFile): PostRef => ({
    id: p.id,
    translationId: p.frontmatter.translationId,
    lang: p.frontmatter.lang,
    slug: p.frontmatter.slug,
    categoryId: p.frontmatter.categoryId,
    authorId: p.frontmatter.authorId,
    tagIds: p.frontmatter.tagIds ?? [],
  });

  async function snapshot(posts: PostFile[]): Promise<ContentSnapshot> {
    const [categories, tags, authors] = await Promise.all([
      readTaxonomy('categories'),
      readTaxonomy('tags'),
      readTaxonomy('authors'),
    ]);
    return {
      posts: posts.map(toPostRef),
      categoryIds: categories.map((c) => c.id),
      tagIds: tags.map((t) => t.id),
      authorIds: authors.map((a) => a.id),
    };
  }

  async function supportedLangs(): Promise<string[]> {
    const config = JSON.parse(await readFile(path.join(configRoot, 'site.config.json'), 'utf8'));
    return config.supportedLangs;
  }

  async function fileExists(file: string): Promise<boolean> {
    try {
      await stat(file);
      return true;
    } catch {
      return false;
    }
  }

  const writeJson = (file: string, data: unknown) => writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`);

  /** The stored data file never contains the id (the filename is the id). */
  const stripId = (body: Record<string, unknown>) => {
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) if (key !== 'id') rest[key] = value;
    return rest;
  };

  async function listTaxonomy(collection: Taxonomy) {
    return (await readTaxonomy(collection)).map((entry) => ({ id: entry.id, ...entry.data }));
  }

  async function createTaxonomy(collection: Taxonomy, body: any): Promise<TaxonomyResult> {
    const id = body?.id;
    if (typeof id !== 'string' || id.length === 0) return { ok: false, status: 400, error: 'Missing id.' };
    let file: string;
    try {
      file = dataFilePath(contentRoot, collection, id);
    } catch {
      return { ok: false, status: 400, error: 'Invalid id.' };
    }
    if (await fileExists(file)) return { ok: false, status: 409, error: 'Already exists.' };
    await writeJson(file, stripId(body));
    return { ok: true, id };
  }

  async function updateTaxonomy(collection: Taxonomy, id: string, body: any): Promise<TaxonomyResult> {
    let file: string;
    try {
      file = dataFilePath(contentRoot, collection, id);
    } catch {
      return { ok: false, status: 400, error: 'Invalid id.' };
    }
    if (!(await fileExists(file))) return { ok: false, status: 404, error: 'Not found.' };
    await writeJson(file, stripId(body ?? {}));
    return { ok: true, id };
  }

  async function usage(id: string, key: 'categoryId' | 'authorId') {
    const refs = (await readAllPosts()).map(toPostRef).filter((p) => p[key] === id);
    return { usageCount: refs.length, posts: refs.map((r) => r.id ?? '') };
  }

  async function guardedDelete(collection: 'categories' | 'authors', id: string, key: 'categoryId' | 'authorId'): Promise<DeleteResult> {
    const posts = (await readAllPosts()).map(toPostRef);
    const guard = key === 'categoryId' ? canDeleteCategory(id, posts) : canDeleteAuthor(id, posts);
    if (!guard.ok) return { ok: false, status: 409, usageCount: guard.usageCount };
    const file = dataFilePath(contentRoot, collection, id);
    if (!(await fileExists(file))) return { ok: false, status: 404, error: 'Not found.' };
    await rm(file, { force: true });
    return { ok: true };
  }

  return {
    async listPosts() {
      const posts = await readAllPosts();
      const langsByGroup = new Map<string, Set<string>>();
      for (const p of posts) {
        const set = langsByGroup.get(p.frontmatter.translationId) ?? new Set<string>();
        set.add(p.frontmatter.lang);
        langsByGroup.set(p.frontmatter.translationId, set);
      }
      const langs = await supportedLangs();
      return posts.map((p) => {
        const groupLangs = langsByGroup.get(p.frontmatter.translationId) ?? new Set<string>();
        return {
          id: p.id,
          translationId: p.frontmatter.translationId,
          lang: p.frontmatter.lang,
          slug: p.frontmatter.slug,
          title: p.frontmatter.title,
          categoryId: p.frontmatter.categoryId,
          authorId: p.frontmatter.authorId,
          tagIds: p.frontmatter.tagIds ?? [],
          published: p.frontmatter.published,
          missingTranslations: langs.filter((l) => !groupLangs.has(l)),
        };
      });
    },

    async getPost(id) {
      const post = (await readAllPosts()).find((p) => p.id === id);
      return post ? { ...post.frontmatter, body: post.body } : null;
    },

    async createPost({ payload, linkTo }) {
      const posts = await readAllPosts();

      let translationId: string;
      let warning = false;
      if (linkTo) {
        const linked = posts.find((p) => p.id === linkTo);
        if (!linked) return { ok: false, status: 400, error: 'Linked post not found.' };
        translationId = linked.frontmatter.translationId;
        warning = checkTranslationCategory(payload.categoryId, linked.frontmatter.categoryId).warning;
      } else if (payload.translationId && payload.translationId.length > 0) {
        translationId = payload.translationId;
      } else {
        translationId = generateTranslationId(posts.map((p) => p.frontmatter.translationId), payload.title);
      }

      const full: PostPayload = { ...payload, translationId };
      const fields = validatePostFields(full);
      if (!fields.ok) return { ok: false, status: 400, error: fields.error };

      const write = validatePostWrite(full, await snapshot(posts));
      if (!write.ok) {
        return { ok: false, status: write.error.startsWith('Slug') ? 409 : 400, error: write.error };
      }

      await writePostFile(contentRoot, full);
      return { ok: true, id: postId(full), translationId, warning };
    },

    async updatePost(id, payload) {
      const posts = await readAllPosts();
      const existing = posts.find((p) => p.id === id);
      if (!existing) return { ok: false, status: 404, error: 'Not found.' };

      const translationId = payload.translationId || existing.frontmatter.translationId;
      const full: PostPayload = { ...payload, translationId };
      const fields = validatePostFields(full);
      if (!fields.ok) return { ok: false, status: 400, error: fields.error };

      const write = validatePostWrite(full, await snapshot(posts), { currentId: id });
      if (!write.ok) {
        return { ok: false, status: write.error.startsWith('Slug') ? 409 : 400, error: write.error };
      }

      const written = await writePostFile(contentRoot, full);
      if (written !== existing.filePath) await rm(existing.filePath, { force: true });
      return { ok: true, id: postId(full), translationId, warning: false };
    },

    async deletePost(id) {
      const post = (await readAllPosts()).find((p) => p.id === id);
      if (!post) return { ok: false, status: 404, error: 'Not found.' };
      await rm(post.filePath, { force: true });
      return { ok: true };
    },

    listCategories: () => listTaxonomy('categories'),
    createCategory: (body) => createTaxonomy('categories', body),
    updateCategory: (id, body) => updateTaxonomy('categories', id, body),
    deleteCategory: (id) => guardedDelete('categories', id, 'categoryId'),
    categoryUsage: (id) => usage(id, 'categoryId'),

    listTags: () => listTaxonomy('tags'),
    createTag: (body) => createTaxonomy('tags', body),
    updateTag: (id, body) => updateTaxonomy('tags', id, body),
    async deleteTag(id) {
      const file = dataFilePath(contentRoot, 'tags', id);
      if (!(await fileExists(file))) return { ok: false, status: 404, error: 'Not found.' };
      const posts = await readAllPosts();
      const plan = planTagDeletion(id, posts.map(toPostRef));
      // Cascade: rewrite each affected post without the tag, then remove the tag file.
      for (const p of posts) {
        if (!(p.frontmatter.tagIds ?? []).includes(id)) continue;
        const full: PostPayload = {
          ...p.frontmatter,
          tagIds: (p.frontmatter.tagIds ?? []).filter((t) => t !== id),
          body: p.body,
        };
        await writePostFile(contentRoot, full);
      }
      await rm(file, { force: true });
      return { ok: true, usageCount: plan.usageCount };
    },

    listAuthors: () => listTaxonomy('authors'),
    createAuthor: (body) => createTaxonomy('authors', body),
    updateAuthor: (id, body) => updateTaxonomy('authors', id, body),
    deleteAuthor: (id) => guardedDelete('authors', id, 'authorId'),
    authorUsage: (id) => usage(id, 'authorId'),
  };
}
