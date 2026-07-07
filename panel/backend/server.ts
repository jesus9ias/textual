/**
 * Assembles the panel HTTP server: a router with every /api route registered
 * against a content store. Localhost binding happens at `listen` time
 * (`main.ts`) — this server is never exposed beyond loopback and never deployed.
 */
import http from 'node:http';
import { Router } from './lib/router.ts';
import type { Store } from './lib/store.ts';
import { registerPosts } from './routes/posts.ts';
import { registerCategories } from './routes/categories.ts';
import { registerTags } from './routes/tags.ts';
import { registerAuthors } from './routes/authors.ts';

export function createServer(store: Store): http.Server {
  const router = new Router();
  registerPosts(router, store);
  registerCategories(router, store);
  registerTags(router, store);
  registerAuthors(router, store);
  return http.createServer((req, res) => router.dispatch(req, res));
}
