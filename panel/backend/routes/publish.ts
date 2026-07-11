/**
 * /api/publish-cut route. A manual, developer-triggered action: the panel has
 * no visibility into GitHub Actions, so this is the developer's own assertion
 * that the last push actually deployed successfully (see panel/spec.md's
 * Publish Invalidation Manifest and Decisions Log).
 */
import type { Router } from '../lib/router.ts';
import type { Store } from '../lib/store.ts';

export function registerPublish(router: Router, store: Store): void {
  router.post('/api/publish-cut', async () => {
    await store.publishCut();
    return { status: 200, body: { ok: true } };
  });
}
