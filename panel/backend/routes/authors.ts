/**
 * /api/authors routes. Deletion is blocked while any post references the author
 * (409 with the usage count), per the Integrity Rules.
 */
import type { Router } from '../lib/router.ts';
import type { Store } from '../lib/store.ts';

export function registerAuthors(router: Router, store: Store): void {
  router.get('/api/authors', async () => ({ status: 200, body: { authors: await store.listAuthors() } }));

  router.post('/api/authors', async ({ body }) => {
    const result = await store.createAuthor(body);
    return result.ok ? { status: 201, body: { id: result.id } } : { status: result.status, body: { error: result.error } };
  });

  router.put('/api/authors/:id', async ({ params, body }) => {
    const result = await store.updateAuthor(params.id, body);
    return result.ok ? { status: 200, body: { id: result.id } } : { status: result.status, body: { error: result.error } };
  });

  router.get('/api/authors/:id/usage', async ({ params }) => ({
    status: 200,
    body: await store.authorUsage(params.id),
  }));

  router.delete('/api/authors/:id', async ({ params }) => {
    const result = await store.deleteAuthor(params.id);
    if (result.ok) return { status: 200, body: { ok: true } };
    return {
      status: result.status,
      body: result.status === 409 ? { error: 'Referenced by posts.', usageCount: result.usageCount } : { error: result.error },
    };
  });
}
