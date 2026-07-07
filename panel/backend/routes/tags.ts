/**
 * /api/tags routes. Deletion is always allowed: it returns the affected post
 * count and cascades the reference removal, per the Integrity Rules.
 */
import type { Router } from '../lib/router.ts';
import type { Store } from '../lib/store.ts';

export function registerTags(router: Router, store: Store): void {
  router.get('/api/tags', async () => ({ status: 200, body: { tags: await store.listTags() } }));

  router.post('/api/tags', async ({ body }) => {
    const result = await store.createTag(body);
    return result.ok ? { status: 201, body: { id: result.id } } : { status: result.status, body: { error: result.error } };
  });

  router.put('/api/tags/:id', async ({ params, body }) => {
    const result = await store.updateTag(params.id, body);
    return result.ok ? { status: 200, body: { id: result.id } } : { status: result.status, body: { error: result.error } };
  });

  router.delete('/api/tags/:id', async ({ params }) => {
    const result = await store.deleteTag(params.id);
    return result.ok
      ? { status: 200, body: { ok: true, usageCount: result.usageCount } }
      : { status: result.status, body: { error: result.error } };
  });
}
