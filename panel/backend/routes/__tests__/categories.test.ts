/**
 * Route-level tests for /api/categories: CRUD, usage, and the deletion block
 * while referenced (panel Gherkin "Category deletion is blocked while referenced").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startPanel } from './helpers.ts';

const categoryBody = (id: string) => ({
  id,
  es: { slug: id, title: id, description: '.' },
  en: { slug: id, title: id, description: '.' },
});

test('GET /api/categories lists categories', async () => {
  const panel = await startPanel();
  try {
    const { status, body } = await panel.get('/api/categories');
    assert.equal(status, 200);
    assert.deepEqual(body.categories.map((c: any) => c.id).sort(), ['economia', 'fisica']);
  } finally {
    await panel.close();
  }
});

test('POST + PUT /api/categories create and update', async () => {
  const panel = await startPanel();
  try {
    assert.equal((await panel.send('POST', '/api/categories', categoryBody('ensayo'))).status, 201);
    const list = await panel.get('/api/categories');
    assert.ok(list.body.categories.some((c: any) => c.id === 'ensayo'));

    const upd = await panel.send('PUT', '/api/categories/ensayo', categoryBody('ensayo'));
    assert.equal(upd.status, 200);
  } finally {
    await panel.close();
  }
});

test('GET /api/categories/:id/usage returns the referencing posts', async () => {
  const panel = await startPanel();
  try {
    const { status, body } = await panel.get('/api/categories/fisica/usage');
    assert.equal(status, 200);
    assert.equal(body.usageCount, 2);
    assert.equal(body.posts.length, 2);
  } finally {
    await panel.close();
  }
});

test('DELETE /api/categories/:id is blocked while referenced, allowed when not', async () => {
  const panel = await startPanel();
  try {
    const blocked = await panel.send('DELETE', '/api/categories/fisica');
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.usageCount, 2);

    await panel.send('POST', '/api/categories', categoryBody('ensayo'));
    const allowed = await panel.send('DELETE', '/api/categories/ensayo');
    assert.equal(allowed.status, 200);
  } finally {
    await panel.close();
  }
});
