/**
 * Builds the CloudFront invalidation paths a post/category/tag/author change
 * affects, and manages the append/de-dup/cut-marker mechanics of the shared
 * manifest (panel/spec.md's Publish Invalidation Manifest). Deliberately
 * duplicates the route/wildcard shape already expressed in
 * blog/frontend/src/lib/routing.mjs rather than importing it — panel/ and
 * blog/ stay fully independent subprojects (see panel/spec.md Decisions Log).
 */

const ROUTE_SEGMENTS = {
  historico: 'historico',
  categoria: 'categoria',
  tag: 'tag',
  autor: 'autor',
  rss: 'rss.xml',
};
const WILDCARD = '*';
const ROOT_ROUTES = { sitemap: '/sitemap.xml', robots: '/robots.txt' };
const CUT_MARKER_PREFIX = '---';

export interface InvalidationCatalog {
  categorySlug(id: string, lang: string): string | undefined;
  tagSlug(id: string, lang: string): string | undefined;
}

export interface PostChangeInput {
  lang: string;
  slug: string;
  categoryId: string;
  tagIds: string[];
  authorId: string;
}

export interface TaxonomyChangeInput {
  kind: 'category' | 'tag' | 'author';
  id: string;
}

function homePath(lang: string): string {
  return `/${lang}/`;
}
/**
 * The home page's actual cached key: the edge CloudFront Function rewrites
 * `/{lang}/` to `/{lang}/index.html` before the cache lookup (see
 * blog/infra/lib/constructs/edge-function.ts), so invalidating the bare
 * `/{lang}/` never matches the real object. Scoped to `index.html` exactly
 * (not a `/{lang}/*` wildcard) — that would invalidate every page under the
 * language on every single publish.
 */
function homeInvalidationPath(lang: string): string {
  return `${homePath(lang)}index.html`;
}
function postPath(lang: string, slug: string): string {
  return `/${lang}/${slug}`;
}
/**
 * The post's actual cached key is `{postPath}/index.html` (same edge-function
 * rewrite as the home page). A trailing wildcard matches it, consistent with
 * every other per-entity invalidation path in this module, and is harmless
 * since nothing else lives under a post's own path.
 */
function postWildcard(lang: string, slug: string): string {
  return `${postPath(lang, slug)}/${WILDCARD}`;
}
function historicoWildcard(lang: string): string {
  return `/${lang}/${ROUTE_SEGMENTS.historico}/${WILDCARD}`;
}
function categoryWildcard(lang: string, slug: string): string {
  return `/${lang}/${ROUTE_SEGMENTS.categoria}/${slug}/${WILDCARD}`;
}
function tagWildcard(lang: string, slug: string): string {
  return `/${lang}/${ROUTE_SEGMENTS.tag}/${slug}/${WILDCARD}`;
}
function authorWildcard(lang: string, id: string): string {
  return `/${lang}/${ROUTE_SEGMENTS.autor}/${id}/${WILDCARD}`;
}
function rssPath(lang: string): string {
  return `/${lang}/${ROUTE_SEGMENTS.rss}`;
}

/** Paths affected by a post create/update/delete: its own page plus its shell. */
export function postInvalidationPaths(post: PostChangeInput, catalog: InvalidationCatalog): string[] {
  const paths = new Set<string>();
  paths.add(postWildcard(post.lang, post.slug));
  paths.add(homeInvalidationPath(post.lang));
  paths.add(historicoWildcard(post.lang));
  paths.add(ROOT_ROUTES.sitemap);
  paths.add(rssPath(post.lang));

  const categorySlug = catalog.categorySlug(post.categoryId, post.lang);
  if (categorySlug) paths.add(categoryWildcard(post.lang, categorySlug));

  for (const tagId of post.tagIds ?? []) {
    const tagSlug = catalog.tagSlug(tagId, post.lang);
    if (tagSlug) paths.add(tagWildcard(post.lang, tagSlug));
  }

  // Authors use their canonical id as the URL slug (no localized slug).
  paths.add(authorWildcard(post.lang, post.authorId));

  return [...paths];
}

/** Paths affected by a category/tag/author-only change (no post write): its own listing, per language. */
export function taxonomyInvalidationPaths(
  taxonomy: TaxonomyChangeInput,
  catalog: InvalidationCatalog,
  supportedLangs: string[],
): string[] {
  const paths = new Set<string>();
  for (const lang of supportedLangs) {
    if (taxonomy.kind === 'category') {
      const slug = catalog.categorySlug(taxonomy.id, lang);
      if (slug) paths.add(categoryWildcard(lang, slug));
    } else if (taxonomy.kind === 'tag') {
      const slug = catalog.tagSlug(taxonomy.id, lang);
      if (slug) paths.add(tagWildcard(lang, slug));
    } else {
      paths.add(authorWildcard(lang, taxonomy.id));
    }
  }
  return [...paths];
}

function isCutMarker(line: string): boolean {
  return line.startsWith(CUT_MARKER_PREFIX);
}

/** Lines after the last cut marker (the whole file if none exists), blanks dropped. */
function pendingLines(manifestLines: string[]): string[] {
  const lastCutIndex = manifestLines.reduce((last, line, i) => (isCutMarker(line) ? i : last), -1);
  return manifestLines.slice(lastCutIndex + 1).filter((line) => line.trim().length > 0);
}

/** Appends newPaths to manifestLines, skipping any already pending since the last cut marker. */
export function appendPaths(manifestLines: string[], newPaths: string[]): string[] {
  const pending = new Set(pendingLines(manifestLines));
  const toAdd = newPaths.filter((path) => !pending.has(path));
  return [...manifestLines, ...toAdd];
}

/** Formats a cut-marker line for the given date, e.g. "---2026/07/10". */
export function formatCutMarker(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${CUT_MARKER_PREFIX}${y}/${m}/${d}`;
}

/** Appends today's cut-marker line, delimiting "published" from "pending". */
export function appendCutMarker(manifestLines: string[], date: Date): string[] {
  return [...manifestLines, formatCutMarker(date)];
}
