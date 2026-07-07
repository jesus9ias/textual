/**
 * Pure hreflang alternate builder — testable outside Astro's build.
 *
 * Given a post and the full set of posts, it returns the `<link rel="alternate"
 * hreflang="...">` entries for every language the piece is translated into,
 * linked via the shared `translationId` (never by transforming the slug), plus
 * one `x-default` entry pointing at the default-language version.
 *
 * A post with no translation in any other language returns an empty list — that
 * is a valid state, not an error (blog/spec.md i18n resolution).
 */
import { absoluteUrl, postPath } from './routing.mjs';

/**
 * @typedef {object} PostLike
 * @property {string} translationId
 * @property {string} lang
 * @property {string} slug
 * @property {boolean} [published]
 */

/**
 * @typedef {object} HreflangAlternate
 * @property {string} hreflang  Language code, or "x-default".
 * @property {string} href      Absolute URL.
 */

/**
 * @param {PostLike} post              The post being rendered.
 * @param {PostLike[]} allPosts        Every post across languages.
 * @param {{ siteUrl: string, defaultLang: string }} options
 * @returns {HreflangAlternate[]}
 */
export function buildHreflangAlternates(post, allPosts, { siteUrl, defaultLang }) {
  const group = allPosts.filter(
    (p) => p.translationId === post.translationId && p.published !== false,
  );

  // Only emit alternates when the piece actually exists in more than one language.
  if (group.length < 2) {
    return [];
  }

  const alternates = group.map((p) => ({
    hreflang: p.lang,
    href: absoluteUrl(siteUrl, postPath(p.lang, p.slug)),
  }));

  const defaultPost = group.find((p) => p.lang === defaultLang) ?? group[0];
  alternates.push({
    hreflang: 'x-default',
    href: absoluteUrl(siteUrl, postPath(defaultPost.lang, defaultPost.slug)),
  });

  return alternates;
}
