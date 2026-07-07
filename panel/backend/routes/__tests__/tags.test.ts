/**
 * Route-level tests for /api/tags: creation and the always-allowed deletion
 * that cascades reference removal (panel Gherkin "Tags can always be deleted").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startPanel } from './helpers.ts';

const tagBody = (id: string) => ({ id, es: { slug: id, title: id }, en: { slug: id, title: id } });

test('POST /api/tags creates a tag', async () => {
  const panel = await startPanel();
  try {
    assert.equal((await panel.send('POST', '/api/tags', tagBody('cosmologia'))).status, 201);
    const list = await panel.get('/api/tags');
    assert.ok(list.body.tags.some((t: any) => t.id === 'cosmologia'));
  } finally {
    await panel.close();
  }
});

test('DELETE /api/tags/:id is always allowed, returns the count, and cascades removal', async () => {
  const panel = await startPanel();
  try {
    const del = await panel.send('DELETE', '/api/tags/relatividad');
    assert.equal(del.status, 200);
    assert.equal(del.body.usageCount, 1); // only the "es" black-holes post uses it

    // The reference is gone from the affected post.
    const post = await panel.get('/api/posts/es:como-se-forman-los-agujeros-negros');
    assert.ok(!post.body.post.tagIds.includes('relatividad'));
  } finally {
    await panel.close();
  }
});
