/**
 * Resolves layout and widget components from the ACTIVE template, which is
 * selected at build time by `PUBLIC_TEMPLATE` (see `site.ts`). Templates live
 * under `src/templates/<name>/`. Components inside a template import each other
 * with relative paths, so they stay within their own template automatically —
 * only the page entry points cross into the template through this resolver.
 *
 * `import.meta.glob` is eager so the chosen component is available synchronously
 * in page frontmatter; every template's files are globbed and selected by name.
 */
import { template } from './site';

interface ComponentModule {
  default: unknown;
}

const layouts = import.meta.glob<ComponentModule>('/src/templates/*/layouts/*.astro', { eager: true });
const categoryLayouts = import.meta.glob<ComponentModule>('/src/templates/*/layouts/categories/*.astro', {
  eager: true,
});
const widgets = import.meta.glob<ComponentModule>('/src/templates/*/widgets/*.astro', { eager: true });

function resolve(map: Record<string, ComponentModule>, key: string, kind: string): unknown {
  const mod = map[key];
  if (!mod) {
    throw new Error(
      `Template ${kind} not found: "${key}". Check PUBLIC_TEMPLATE ("${template}") and that the file exists.`,
    );
  }
  return mod.default;
}

/** A layout component (e.g. "Base", "Post") from the active template. */
export function layout(name: string): any {
  return resolve(layouts, `/src/templates/${template}/layouts/${name}.astro`, 'layout');
}

/** A widget component (e.g. "PostList", "Menu") from the active template. */
export function widget(name: string): any {
  return resolve(widgets, `/src/templates/${template}/widgets/${name}.astro`, 'widget');
}

/** The category-specific layout for a categoryId, or undefined to fall back to Post. */
export function categoryLayout(categoryId: string): any {
  return categoryLayouts[`/src/templates/${template}/layouts/categories/${categoryId}.astro`]?.default;
}
