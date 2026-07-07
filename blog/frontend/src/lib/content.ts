/**
 * Query helpers over the content collections. Centralizes the "only published",
 * "scoped by language", and "resolve reference" logic so pages and widgets never
 * re-implement it. All functions operate on Astro's already-typed collection
 * entries — no re-parsing of Markdown/JSON.
 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;
export type CategoryEntry = CollectionEntry<'categories'>;
export type TagEntry = CollectionEntry<'tags'>;
export type AuthorEntry = CollectionEntry<'authors'>;

const isPublished = (post: PostEntry): boolean => post.data.published !== false;
const byNewest = (a: PostEntry, b: PostEntry): number =>
  b.data.createdAt.getTime() - a.data.createdAt.getTime();

/** All published posts across every language, newest first. */
export async function getPublishedPosts(): Promise<PostEntry[]> {
  const posts = await getCollection('posts');
  return posts.filter(isPublished).sort(byNewest);
}

/** Published posts for a single language, newest first. */
export async function getPublishedPostsByLang(lang: string): Promise<PostEntry[]> {
  return (await getPublishedPosts()).filter((p) => p.data.lang === lang);
}

/** Minimal shape consumed by the pure hreflang builder. */
export function toPostLike(post: PostEntry): {
  translationId: string;
  lang: string;
  slug: string;
  published: boolean;
} {
  return {
    translationId: post.data.translationId,
    lang: post.data.lang,
    slug: post.data.slug,
    published: isPublished(post),
  };
}

export async function getCategoriesMap(): Promise<Map<string, CategoryEntry>> {
  const categories = await getCollection('categories');
  return new Map(categories.map((c) => [c.id, c]));
}
export async function getTagsMap(): Promise<Map<string, TagEntry>> {
  const tags = await getCollection('tags');
  return new Map(tags.map((t) => [t.id, t]));
}
export async function getAuthorsMap(): Promise<Map<string, AuthorEntry>> {
  const authors = await getCollection('authors');
  return new Map(authors.map((a) => [a.id, a]));
}

/** Finds the category whose localized slug matches, for a given language. */
export async function findCategoryBySlug(
  lang: string,
  slug: string,
): Promise<CategoryEntry | undefined> {
  const categories = await getCollection('categories');
  return categories.find((c) => localized(c, lang).slug === slug);
}
export async function findTagBySlug(lang: string, slug: string): Promise<TagEntry | undefined> {
  const tags = await getCollection('tags');
  return tags.find((tg) => localized(tg, lang).slug === slug);
}
export async function findAuthorBySlug(
  lang: string,
  slug: string,
): Promise<AuthorEntry | undefined> {
  // Authors have no localized slug in the domain model — their canonical `id`
  // is used as the URL slug.
  const authors = await getCollection('authors');
  return authors.find((a) => a.id === slug);
}

/**
 * Returns the language block of a data entry (category/tag). Typed loosely to
 * keep call sites terse; callers pass a supported language.
 */
export function localized(
  entry: CategoryEntry | TagEntry,
  lang: string,
): { slug: string; title: string; description?: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (entry.data as any)[lang];
}

export function localizedAuthor(entry: AuthorEntry, lang: string): { name: string; bio: string; avatar: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (entry.data as any)[lang];
}
