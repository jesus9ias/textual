/**
 * Minimal frontmatter reader shared by the CI scripts that need raw file
 * contents rather than Astro's already-parsed collections (`getCollection()`
 * is build-only and not importable from standalone Node). Used by
 * `content-reader.mjs`, which backs `validate-integrity.mjs`.
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
