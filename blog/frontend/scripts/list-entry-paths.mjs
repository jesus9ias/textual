/**
 * Prints one `"{lang}/{slug}"` prefix per published post, used by the deploy
 * workflow to split the build output: post pages go to the `entries` bucket,
 * everything else to the `shell` bucket. Reads the committed content with the
 * shared raw reader (no Astro runtime needed).
 */
import path from 'node:path';
import { readPosts } from './lib/content-reader.mjs';

const postsDir = path.join(process.cwd(), 'src', 'content', 'posts');
const posts = readPosts(postsDir).filter((p) => p.data.published !== false);

for (const post of posts) {
  process.stdout.write(`${post.data.lang}/${post.data.slug}\n`);
}
