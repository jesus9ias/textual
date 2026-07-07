/**
 * Per-language RSS feed: `/es/rss.xml`, `/en/rss.xml` — symmetric, no
 * default-language special case. An RSS feed is inherently single-language, so
 * there is one feed per language (see blog/spec.md Decisions Log).
 */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getPublishedPostsByLang } from '../../lib/content';
import { supportedLangs, siteUrl } from '../../lib/site';
import { postPath } from '../../lib/routing.mjs';
import { t } from '../../i18n/ui.mjs';

export function getStaticPaths() {
  return supportedLangs.map((lang) => ({ params: { lang } }));
}

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as string;
  const posts = await getPublishedPostsByLang(lang);
  return rss({
    title: t(lang, 'siteTitle'),
    description: t(lang, 'siteTagline'),
    site: siteUrl,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.createdAt,
      link: postPath(lang, p.data.slug),
    })),
  });
};
