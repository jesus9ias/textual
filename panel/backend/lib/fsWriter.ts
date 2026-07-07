/**
 * Serialization and atomic filesystem writes for the panel backend.
 *
 * Every write is atomic (temp file then rename) so an interrupted process never
 * leaves a partial/corrupted file. Path segments are sanitized before building
 * a filesystem path — no path traversal from `slug`/`lang` values.
 */
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import type { PostPayload } from './types.ts';

const LANG_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requireSegment(value: string, pattern: RegExp, name: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`Invalid ${name} segment: "${value}"`);
  }
  return value;
}

/** Serializes a post payload to Markdown: YAML frontmatter followed by the body. */
export function serializePost(payload: PostPayload): string {
  const { body, ...frontmatter } = payload;
  const yaml = stringify(frontmatter);
  return `---\n${yaml}---\n\n${body}\n`;
}

/**
 * Builds the on-disk path for a post, rejecting any `lang`/`slug` that is not a
 * clean single segment (blocks `../` traversal and absolute paths).
 */
export function postFilePath(contentRoot: string, lang: string, slug: string): string {
  const safeLang = requireSegment(lang, LANG_PATTERN, 'lang');
  const safeSlug = requireSegment(slug, SLUG_PATTERN, 'slug');
  const target = path.join(contentRoot, 'posts', safeLang, `${safeSlug}.md`);

  // Defense in depth: the resolved path must stay under <contentRoot>/posts.
  const postsRoot = path.resolve(contentRoot, 'posts');
  const resolved = path.resolve(target);
  if (resolved !== postsRoot && !resolved.startsWith(postsRoot + path.sep)) {
    throw new Error('Resolved path escapes the content root.');
  }
  return target;
}

const COLLECTION_PATTERN = /^(?:categories|tags|authors)$/;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Builds the on-disk path for a taxonomy data file
 * (`<contentRoot>/<collection>/<id>.json`), rejecting an unknown collection or
 * an id that is not a clean single segment.
 */
export function dataFilePath(contentRoot: string, collection: string, id: string): string {
  const safeCollection = requireSegment(collection, COLLECTION_PATTERN, 'collection');
  const safeId = requireSegment(id, ID_PATTERN, 'id');
  const target = path.join(contentRoot, safeCollection, `${safeId}.json`);

  const collectionRoot = path.resolve(contentRoot, safeCollection);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(collectionRoot + path.sep)) {
    throw new Error('Resolved path escapes the content root.');
  }
  return target;
}

export interface WriteHooks {
  /** Test seam: runs after the temp file is written, before the rename. */
  beforeRename?: () => void | Promise<void>;
}

/** Writes `contents` to `filePath` atomically (temp file, then rename). */
export async function writeFileAtomic(
  filePath: string,
  contents: string,
  hooks: WriteHooks = {},
): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const unique = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${unique}.tmp`);

  await writeFile(tempPath, contents, 'utf8');
  try {
    if (hooks.beforeRename) await hooks.beforeRename();
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

/** Writes a post to `<contentRoot>/posts/<lang>/<slug>.md` atomically. */
export async function writePostFile(
  contentRoot: string,
  payload: PostPayload,
  hooks?: WriteHooks,
): Promise<string> {
  const target = postFilePath(contentRoot, payload.lang, payload.slug);
  await writeFileAtomic(target, serializePost(payload), hooks);
  return target;
}
