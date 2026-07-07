/**
 * Reads the committed content files (posts `.md`, taxonomy `.json`) from a
 * content directory into the same `{ id, data }` shape Astro's `getCollection()`
 * produces, so the pure integrity checks run identically in CI (standalone
 * Node) and in tests. This is the single shared raw reader used by both CI
 * scripts — `validate-integrity.mjs` (this loader) and `detect-changed-views.mjs`
 * (its frontmatter parsing) — so there is one raw parser, not two.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

/** Recursively collects files with a given extension under `dir`. */
function walk(dir, ext) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full, ext));
    } else if (entry.endsWith(ext)) {
      found.push(full);
    }
  }
  return found;
}

/** Reads all posts under `postsDir`, keyed by their path-relative id (no extension). */
export function readPosts(postsDir) {
  return walk(postsDir, '.md').map((full) => {
    const relative = path.relative(postsDir, full).replace(/\\/g, '/').replace(/\.md$/, '');
    const data = parseFrontmatter(readFileSync(full, 'utf8'));
    return { id: relative, data: { ...data, tagIds: data.tagIds ?? [] } };
  });
}

/** Reads a flat `.json` data collection (categories/tags/authors). */
export function readDataCollection(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({
      id: file.replace(/\.json$/, ''),
      data: JSON.parse(readFileSync(path.join(dir, file), 'utf8')),
    }));
}
