/**
 * Minimal frontmatter reader for the CI change-detection script.
 *
 * Unlike `validate-integrity.mjs` (which consumes Astro's already-parsed
 * collections), `detect-changed-views.mjs` must read *raw* file contents —
 * including historical versions pulled from git for modified/removed posts,
 * which Astro's `getCollection()` cannot see. This module isolates that raw
 * parsing in one place.
 */
import { parse as parseYaml } from 'yaml';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Extracts and parses the YAML frontmatter block of a Markdown string.
 * @param {string} markdown
 * @returns {Record<string, unknown>}
 */
export function parseFrontmatter(markdown) {
  const match = FRONTMATTER_PATTERN.exec(markdown);
  if (!match) return {};
  return parseYaml(match[1]) ?? {};
}
