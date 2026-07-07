/**
 * Shared type declarations for the panel backend. No runtime code — kept
 * separate so `integrity.ts` and `fsWriter.ts` share one definition of the
 * content shapes and result unions.
 *
 * The result unions follow the discriminated `{ ok: true; ... } | { ok: false }`
 * pattern from the panel spec Decisions Log, so success/failure is
 * type-narrowable at every call site.
 */

/** A post as authored in the panel: canonical frontmatter fields + Markdown body. */
export interface PostPayload {
  translationId: string;
  lang: string;
  slug: string;
  title: string;
  description: string;
  authorId: string;
  categoryId: string;
  tagIds: string[];
  coverImage: { src: string; alt: string };
  createdAt: string;
  updatedAt: string;
  published: boolean;
  body: string;
}

/** The frontmatter portion of a post (everything the panel writes except the body). */
export type PostFrontmatter = Omit<PostPayload, 'body'>;

/** A minimal reference to an existing post, used for referential checks. */
export interface PostRef {
  id?: string;
  translationId: string;
  lang: string;
  slug: string;
  categoryId: string;
  authorId: string;
  tagIds: string[];
}

/** Snapshot of currently-existing content the write-time checks validate against. */
export interface ContentSnapshot {
  posts: PostRef[];
  categoryIds: string[];
  authorIds: string[];
  tagIds: string[];
}

export type FieldResult = { ok: true } | { ok: false; error: string };

export type WriteResult = { ok: true; warning?: boolean } | { ok: false; error: string };

export type DeleteGuard = { ok: true } | { ok: false; usageCount: number };

export interface TagDeletionPlan {
  ok: true;
  usageCount: number;
  updatedPosts: PostRef[];
}

export interface TranslationCategoryCheck {
  ok: true;
  warning: boolean;
}
