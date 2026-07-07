/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Absolute public site URL, injected from `.env` at build time. */
  readonly PUBLIC_SITE_URL: string;
  /** Active template name under `src/templates/`, selected at build time. */
  readonly PUBLIC_TEMPLATE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
