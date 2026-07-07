/**
 * /api/categories routes. Deletion is blocked while any post references the
 * category (409 with the usage count), per the Integrity Rules.
 */
import type { Router } from '../lib/router.ts';
import type { Store } from '../lib/store.ts';

export function registerCategories(router: Router, store: Store): void {
  router.get('/api/categories', async () => ({ status: 200, body: { categories: await store.listCategories() } }));

  router.post('/api/categories', async ({ body }) => {
    const result = await store.createCategory(body);
    return result.ok ? { status: 201, body: { id: result.id } } : { status: result.status, body: { error: result.error } };
  });

  router.put('/api/categories/:id', async ({ params, body }) => {
    const result = await store.updateCategory(params.id, body);
    return result.ok ? { status: 200, body: { id: result.id } } : { status: result.status, body: { error: result.error } };
  });

  router.get('/api/categories/:id/usage', async ({ params }) => ({
    status: 200,
    body: await store.categoryUsage(params.id),
  }));

  router.delete('/api/categories/:id', async ({ params }) => {
    const result = await store.deleteCategory(params.id);
    if (result.ok) return { status: 200, body: { ok: true } };
    return {
      status: result.status,
      body: result.status === 409 ? { error: 'Referenced by posts.', usageCount: result.usageCount } : { error: result.error },
    };
  });
}
