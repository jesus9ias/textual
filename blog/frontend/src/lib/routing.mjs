/**
 * Framework-agnostic routing constants and URL builders for the blog.
 *
 * Kept as plain ESM (with JSDoc types) so both Astro components/endpoints and
 * the dependency-free unit tests can import the exact same logic. Route
 * segments are fixed (not localized) — they are the same under every language
 * prefix, e.g. `/es/categoria/...` and `/en/categoria/...`. No literal segment
 * or page size is inlined at a call site ("No magic values").
 */

/** Fixed route segments used under the `[lang]` prefix. */
export const ROUTE_SEGMENTS = Object.freeze({
  historico: 'historico',
  categoria: 'categoria',
  tag: 'tag',
  autor: 'autor',
  rss: 'rss.xml',
});

/** Root-level (language-agnostic) route paths. */
export const ROOT_ROUTES = Object.freeze({
  sitemap: '/sitemap.xml',
  robots: '/robots.txt',
});

/** Posts shown per aggregator page. */
export const PAGE_SIZE = 10;

/** Trims a trailing slash so URL joins never double up. */
function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/** Joins a base site URL and an absolute path into one absolute URL. */
export function absoluteUrl(siteUrl, path) {
  const base = trimTrailingSlash(siteUrl);
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Path of a post detail page: `/{lang}/{slug}`. */
export function postPath(lang, slug) {
  return `/${lang}/${slug}`;
}

/** Path of a language home page: `/{lang}/`. */
export function homePath(lang) {
  return `/${lang}/`;
}

/**
 * CloudFront paths invalidated on every publish regardless of the manifest's
 * content: every language's home page plus the root SEO surfaces. These are
 * the only routes affected by changes the panel does not track (template,
 * layout, or page edits made directly in code) — document any new
 * root-level or non-panel-tracked view here immediately.
 *
 * The home entry targets `{homePath}index.html`, not the bare `{homePath}`:
 * the edge CloudFront Function rewrites directory-style URIs to append
 * `index.html` before the cache lookup (see
 * `infra/lib/constructs/edge-function.ts`), so that's the key actually
 * cached — invalidating the bare path never matches it. `index.html` is used
 * instead of a `{homePath}*` wildcard because the latter would invalidate
 * every page under that language on every single publish.
 * @param {readonly string[]} supportedLangs
 * @returns {string[]}
 */
export function alwaysInvalidatePaths(supportedLangs) {
  return [
    ...supportedLangs.map((lang) => `${homePath(lang)}index.html`),
    ROOT_ROUTES.sitemap,
    ROOT_ROUTES.robots,
  ];
}

/** Path of a paginated aggregator page under `[lang]`. */
export function historicoPath(lang, page) {
  return `/${lang}/${ROUTE_SEGMENTS.historico}/${page}`;
}
export function categoryPath(lang, slug, page) {
  return `/${lang}/${ROUTE_SEGMENTS.categoria}/${slug}/${page}`;
}
export function tagPath(lang, slug, page) {
  return `/${lang}/${ROUTE_SEGMENTS.tag}/${slug}/${page}`;
}
export function authorPath(lang, slug, page) {
  return `/${lang}/${ROUTE_SEGMENTS.autor}/${slug}/${page}`;
}

/** Path of a per-language RSS feed: `/{lang}/rss.xml`. */
export function rssPath(lang) {
  return `/${lang}/${ROUTE_SEGMENTS.rss}`;
}

/** CloudFront invalidation wildcard token. */
export const INVALIDATION_WILDCARD = '*';

/**
 * Wildcard invalidation paths for paginated aggregators — a single content
 * change reshuffles every page of the set, so the whole prefix is invalidated.
 */
export function historicoWildcard(lang) {
  return `/${lang}/${ROUTE_SEGMENTS.historico}/${INVALIDATION_WILDCARD}`;
}
export function categoryWildcard(lang, slug) {
  return `/${lang}/${ROUTE_SEGMENTS.categoria}/${slug}/${INVALIDATION_WILDCARD}`;
}
export function tagWildcard(lang, slug) {
  return `/${lang}/${ROUTE_SEGMENTS.tag}/${slug}/${INVALIDATION_WILDCARD}`;
}
export function authorWildcard(lang, slug) {
  return `/${lang}/${ROUTE_SEGMENTS.autor}/${slug}/${INVALIDATION_WILDCARD}`;
}

/**
 * Splits items into fixed-size pages. Always returns at least one (possibly
 * empty) page so an empty listing still generates a page 1.
 * @template T
 * @param {T[]} items
 * @param {number} [size]
 * @returns {T[][]}
 */
export function chunk(items, size = PAGE_SIZE) {
  if (items.length === 0) return [[]];
  const pages = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

/** Number of real content pages (0 when there are no items, unlike `chunk`). */
export function pageCount(items) {
  return items.length === 0 ? 0 : chunk(items).length;
}

/**
 * Builds the language-switcher list for a paginated aggregator page: each
 * language links to the same page number when that page exists in it, otherwise
 * to that language's home (so the switcher is never a dead end on listings).
 * @param {object} args
 * @param {readonly string[]} args.supportedLangs
 * @param {number} args.page
 * @param {Record<string, number>} args.pageCountByLang
 * @param {(lang: string, page: number) => string} args.urlFor
 * @returns {{ lang: string, href: string }[]}
 */
export function paginatedLangSwitch({ supportedLangs, page, pageCountByLang, urlFor }) {
  return supportedLangs.map((lang) => ({
    lang,
    href: (pageCountByLang[lang] ?? 0) >= page ? urlFor(lang, page) : homePath(lang),
  }));
}
