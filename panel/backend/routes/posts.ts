/**
 * /api/posts routes. Every mutation runs through the store, which validates via
 * `integrity.ts` before writing via `fsWriter.ts`.
 */
import type { Router } from '../lib/router.ts';
import type { Store } from '../lib/store.ts';

export function registerPosts(router: Router, store: Store): void {
  router.get('/api/posts', async () => ({ status: 200, body: { posts: await store.listPosts() } }));

  router.get('/api/posts/:id', async ({ params }) => {
    const post = await store.getPost(params.id);
    return post ? { status: 200, body: { post } } : { status: 404, body: { error: 'Not found.' } };
  });

  router.post('/api/posts', async ({ body }) => {
    const input = (body ?? {}) as { payload: any; linkTo?: string };
    const result = await store.createPost({ payload: input.payload, linkTo: input.linkTo });
    return result.ok
      ? { status: 201, body: { id: result.id, translationId: result.translationId, warning: result.warning } }
      : { status: result.status, body: { error: result.error } };
  });

  router.put('/api/posts/:id', async ({ params, body }) => {
    const input = (body ?? {}) as { payload: any };
    const result = await store.updatePost(params.id, input.payload);
    return result.ok
      ? { status: 200, body: { id: result.id, translationId: result.translationId } }
      : { status: result.status, body: { error: result.error } };
  });

  router.delete('/api/posts/:id', async ({ params }) => {
    const result = await store.deletePost(params.id);
    return result.ok ? { status: 200, body: { ok: true } } : { status: result.status, body: { error: result.error } };
  });
}
