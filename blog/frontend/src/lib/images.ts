/**
 * Resolves a post's `coverImage.src` (a site-absolute-looking path such as
 * `/assets/posts/{translationId}/cover.jpg`) to the physical asset under
 * `src/assets`, so it can be handed to Astro's `<Image>` component for
 * optimization (resize, WebP/AVIF, lazy loading). Covers live under `src/`
 * precisely so they are processed rather than served raw.
 */
import type { ImageMetadata } from 'astro';

const covers = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/posts/**/*.{jpeg,jpg,png,webp,avif}',
);

/** Maps the frontmatter cover path to its imported `ImageMetadata`, if present. */
export async function resolveCover(src: string): Promise<ImageMetadata | undefined> {
  const physicalPath = `/src${src}`;
  const loader = covers[physicalPath];
  if (!loader) return undefined;
  const mod = await loader();
  return mod.default;
}
