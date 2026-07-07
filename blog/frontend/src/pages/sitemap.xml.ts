/**
 * Sitemap at the true root path (outside `[lang]`), so the root-redirect rule
 * (which matches only the exact `/`) never touches it. Lists every published
 * post's absolute URL in every language plus the aggregator pages, and
 * cross-references language alternates per `<url>` via `xhtml:link`
 * (Google's recommended multilingual sitemap method) — for both posts (linked
 * by `translationId`) and aggregators (same entity, same page number).
 *
 * A "group" is one logical page and the set of languages it exists in. Each
 * group emits one `<url>` per language, all sharing the same alternates block;
 * single-language groups carry no alternates (mirroring the `<head>` hreflang
 * behavior for untranslated content). Unpublished posts are excluded because
 * `getPublishedPosts()` filters them out.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPublishedPosts, localized, type PostEntry } from '../lib/content';
import { supportedLangs, siteUrl, defaultLang } from '../lib/site';
import {
  absoluteUrl,
  homePath,
  postPath,
  historicoPath,
  categoryPath,
  tagPath,
  authorPath,
  chunk,
} from '../lib/routing.mjs';

/** One logical page and the absolute URL of each language it exists in. */
type UrlGroup = { langToUrl: Map<string, string> };

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

async function buildGroups(): Promise<UrlGroup[]> {
  const posts = await getPublishedPosts();
  const [categories, tags, authors] = await Promise.all([
    getCollection('categories'),
    getCollection('tags'),
    getCollection('authors'),
  ]);

  const groups: UrlGroup[] = [];

  // Home — exists in every language.
  const home = new Map<string, string>();
  for (const lang of supportedLangs) home.set(lang, absoluteUrl(siteUrl, homePath(lang)));
  groups.push({ langToUrl: home });

  // Posts — grouped by translationId (the language-alternate relationship).
  const byTranslation = new Map<string, PostEntry[]>();
  for (const post of posts) {
    const list = byTranslation.get(post.data.translationId) ?? [];
    list.push(post);
    byTranslation.set(post.data.translationId, list);
  }
  for (const list of byTranslation.values()) {
    const langToUrl = new Map<string, string>();
    for (const post of list) {
      langToUrl.set(post.data.lang, absoluteUrl(siteUrl, postPath(post.data.lang, post.data.slug)));
    }
    groups.push({ langToUrl });
  }

  // Paginated aggregators — link the same page number across languages, only
  // where that page actually exists for the language.
  const addPaginated = (
    postsByLang: Map<string, PostEntry[]>,
    urlFor: (lang: string, page: number) => string,
  ): void => {
    const pageCounts = [...postsByLang.values()]
      .filter((list) => list.length > 0)
      .map((list) => chunk(list).length);
    const maxPages = pageCounts.length > 0 ? Math.max(...pageCounts) : 0;

    for (let page = 1; page <= maxPages; page++) {
      const langToUrl = new Map<string, string>();
      for (const [lang, list] of postsByLang) {
        if (list.length > 0 && chunk(list).length >= page) {
          langToUrl.set(lang, absoluteUrl(siteUrl, urlFor(lang, page)));
        }
      }
      if (langToUrl.size > 0) groups.push({ langToUrl });
    }
  };

  const postsForLang = (lang: string) => posts.filter((p) => p.data.lang === lang);
  const byLang = (predicate: (p: PostEntry) => boolean) => {
    const map = new Map<string, PostEntry[]>();
    for (const lang of supportedLangs) map.set(lang, postsForLang(lang).filter(predicate));
    return map;
  };

  // Archive.
  addPaginated(byLang(() => true), (lang, page) => historicoPath(lang, page));

  // Categories / tags / authors.
  for (const category of categories) {
    addPaginated(
      byLang((p) => p.data.categoryId === category.id),
      (lang, page) => categoryPath(lang, localized(category, lang).slug, page),
    );
  }
  for (const tag of tags) {
    addPaginated(
      byLang((p) => p.data.tagIds.includes(tag.id)),
      (lang, page) => tagPath(lang, localized(tag, lang).slug, page),
    );
  }
  for (const author of authors) {
    addPaginated(
      byLang((p) => p.data.authorId === author.id),
      (lang, page) => authorPath(lang, author.id, page),
    );
  }

  return groups;
}

function renderGroup(group: UrlGroup): string {
  const langs = [...group.langToUrl.keys()];

  const alternates: string[] =
    langs.length > 1
      ? [
          ...langs.map(
            (lang) =>
              `    <xhtml:link rel="alternate" hreflang="${lang}" href="${group.langToUrl.get(lang)}"/>`,
          ),
          ...(group.langToUrl.has(defaultLang)
            ? [
                `    <xhtml:link rel="alternate" hreflang="x-default" href="${group.langToUrl.get(defaultLang)}"/>`,
              ]
            : []),
        ]
      : [];

  return langs
    .map((lang) => {
      const loc = `    <loc>${group.langToUrl.get(lang)}</loc>`;
      const body = alternates.length > 0 ? `${loc}\n${alternates.join('\n')}` : loc;
      return `  <url>\n${body}\n  </url>`;
    })
    .join('\n');
}

export const GET: APIRoute = async () => {
  const groups = await buildGroups();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="${XHTML_NS}">
${groups.map(renderGroup).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
