// @ts-check
import { defineConfig } from 'astro/config';

/**
 * `site` is the absolute site URL, sourced exclusively from the environment
 * (`PUBLIC_SITE_URL`) — never hardcoded. It feeds canonical URLs, hreflang
 * alternates, sitemap, robots and RSS. Content routing is done with explicit
 * `[lang]` segments (see src/pages), not Astro's i18n config, so the default
 * language is never special-cased.
 */
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL,
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
