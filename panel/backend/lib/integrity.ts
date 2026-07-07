/**
 * Write-time referential-integrity core for the panel backend. Pure functions
 * over in-memory snapshots — the routes (Stage 2) wire these to real content
 * and to `fsWriter.ts`. Every relational field is checked against currently
 * existing ids before a write is accepted (never trusted from client state).
 *
 * The `postFrontmatterSchema` mirrors the canonical Domain Model (monorepo
 * spec). It is a panel-local copy because the blog's own schema imports
 * `astro:content` (build-only) and cannot be reused from plain Node; the two
 * must stay in sync — any Domain Model change updates both.
 */
import { z } from 'zod';
import type {
  ContentSnapshot,
  DeleteGuard,
  FieldResult,
  PostPayload,
  PostRef,
  TagDeletionPlan,
  TranslationCategoryCheck,
  WriteResult,
} from './types.ts';

export const postFrontmatterSchema = z.object({
  translationId: z.string().min(1),
  lang: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().max(160),
  authorId: z.string().min(1),
  categoryId: z.string().min(1),
  tagIds: z.array(z.string()),
  coverImage: z.object({ src: z.string().min(1), alt: z.string().min(1) }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  published: z.boolean(),
});

/** Validates the post's own fields (title, description length, cover alt, …). */
export function validatePostFields(payload: PostPayload): FieldResult {
  const { body: _body, ...frontmatter } = payload;
  const parsed = postFrontmatterSchema.safeParse(frontmatter);
  if (parsed.success) return { ok: true };
  const error = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return { ok: false, error };
}

/**
 * Validates a post write against existing content: every relational field must
 * resolve, and the slug must be unique within its language.
 */
export function validatePostWrite(
  payload: PostPayload,
  snapshot: ContentSnapshot,
  opts: { currentId?: string } = {},
): WriteResult {
  if (!snapshot.categoryIds.includes(payload.categoryId)) {
    return { ok: false, error: `Unknown categoryId "${payload.categoryId}".` };
  }
  if (!snapshot.authorIds.includes(payload.authorId)) {
    return { ok: false, error: `Unknown authorId "${payload.authorId}".` };
  }
  const unknownTag = payload.tagIds.find((id) => !snapshot.tagIds.includes(id));
  if (unknownTag) {
    return { ok: false, error: `Unknown tagId "${unknownTag}".` };
  }
  // A matching slug in the same language is a conflict unless it belongs to the
  // very post being edited (identified by `currentId`).
  const slugTaken = snapshot.posts.some(
    (p) =>
      p.lang === payload.lang &&
      p.slug === payload.slug &&
      (opts.currentId === undefined || p.id !== opts.currentId),
  );
  if (slugTaken) {
    return { ok: false, error: `Slug "${payload.slug}" already exists in lang "${payload.lang}".` };
  }
  return { ok: true };
}

/** A category cannot be deleted while any post references it. */
export function canDeleteCategory(categoryId: string, posts: PostRef[]): DeleteGuard {
  const usageCount = posts.filter((p) => p.categoryId === categoryId).length;
  return usageCount > 0 ? { ok: false, usageCount } : { ok: true };
}

/** An author cannot be deleted while any post references it. */
export function canDeleteAuthor(authorId: string, posts: PostRef[]): DeleteGuard {
  const usageCount = posts.filter((p) => p.authorId === authorId).length;
  return usageCount > 0 ? { ok: false, usageCount } : { ok: true };
}

/**
 * Tags can always be deleted. Returns how many posts reference the tag and the
 * posts with the reference removed, so the caller can persist the cascade
 * atomically with the tag's own removal.
 */
export function planTagDeletion(tagId: string, posts: PostRef[]): TagDeletionPlan {
  const affected = posts.filter((p) => p.tagIds.includes(tagId));
  const updatedPosts = affected.map((p) => ({
    ...p,
    tagIds: p.tagIds.filter((id) => id !== tagId),
  }));
  return { ok: true, usageCount: affected.length, updatedPosts };
}

/**
 * Non-blocking check for the translation-link flow: saving is always allowed,
 * but a category mismatch between linked translations raises a warning (the CI
 * gate turns the same condition into a hard error).
 */
export function checkTranslationCategory(
  categoryId: string,
  linkedCategoryId: string,
): TranslationCategoryCheck {
  return { ok: true, warning: categoryId !== linkedCategoryId };
}

/**
 * The posts a new `targetLang` post may link to: existing posts whose
 * translation group does not yet have a version in `targetLang`.
 */
export function translationLinkCandidates(posts: PostRef[], targetLang: string): PostRef[] {
  return posts.filter(
    (p) =>
      p.lang !== targetLang &&
      !posts.some((other) => other.translationId === p.translationId && other.lang === targetLang),
  );
}

const DIACRITICS = /\p{M}/gu;
const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const READABLE_ADJECTIVES = ['bright', 'calm', 'swift', 'quiet', 'bold', 'clear', 'warm', 'keen'];
const READABLE_NOUNS = ['comet', 'river', 'ember', 'harbor', 'meadow', 'signal', 'anchor', 'summit'];

function slugify(input: string): string {
  return input.normalize('NFD').replace(DIACRITICS, '').toLowerCase().replace(NON_SLUG, '-').replace(EDGE_HYPHENS, '');
}

function randomReadable(): string {
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  return `${pick(READABLE_ADJECTIVES)}-${pick(READABLE_NOUNS)}`;
}

/**
 * Generates a readable, slug-shaped `translationId` (not a UUID), derived from a
 * seed (typically the post title) when given, guaranteed unique against
 * `existing`.
 */
export function generateTranslationId(existing: Iterable<string>, seed?: string): string {
  const used = new Set(existing);
  const base = (seed && slugify(seed)) || randomReadable();
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
