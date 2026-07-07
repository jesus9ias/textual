/**
 * Site-level configuration surface. `siteUrl` comes from the environment
 * (`PUBLIC_SITE_URL`) and falls back to the committed placeholder only when the
 * env var is absent; the real value is never hardcoded in committed source.
 */
import siteConfig from '../site.config.json';

export const defaultLang: string = siteConfig.defaultLang;
export const supportedLangs: readonly string[] = siteConfig.supportedLangs;
export const defaultCoverImage: string = siteConfig.defaultCoverImage;

export const siteUrl: string = import.meta.env.PUBLIC_SITE_URL ?? siteConfig.siteUrl;

/** Active template name, selected at build time from the environment. */
export const DEFAULT_TEMPLATE = 'default';
export const template: string = import.meta.env.PUBLIC_TEMPLATE ?? DEFAULT_TEMPLATE;
