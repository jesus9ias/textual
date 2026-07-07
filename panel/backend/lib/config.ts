/**
 * Loads the panel backend configuration from the environment. All values are
 * environment-specific and live in `.env` only.
 *
 * `BLOG_CONTENT_PATH` points at `blog/frontend/src/content` (posts + the
 * categories/tags/authors collections, per the Domain Model); `BLOG_CONFIG_PATH`
 * points at `blog/frontend/src` (where `site.config.json` lives).
 */
const DEFAULT_PORT = 4321;

export interface PanelConfig {
  contentRoot: string;
  configRoot: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PanelConfig {
  const contentRoot = env.BLOG_CONTENT_PATH?.trim();
  const configRoot = env.BLOG_CONFIG_PATH?.trim();
  const missing: string[] = [];
  if (!contentRoot) missing.push('BLOG_CONTENT_PATH');
  if (!configRoot) missing.push('BLOG_CONFIG_PATH');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}. Copy .env.example to .env.`);
  }

  const port = env.PANEL_PORT ? Number(env.PANEL_PORT) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PANEL_PORT must be a positive integer; got "${env.PANEL_PORT}".`);
  }

  return { contentRoot: contentRoot as string, configRoot: configRoot as string, port };
}
