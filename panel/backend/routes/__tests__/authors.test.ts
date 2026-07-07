/**
 * Route-level tests for /api/authors: usage and the deletion block while
 * referenced (panel Gherkin "Author deletion is blocked while referenced").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startPanel } from './helpers.ts';

const authorBody = (id: string, name: string) => ({
  id,
  es: { name, bio: '.', avatar: '/a.jpg' },
  en: { name, bio: '.', avatar: '/a.jpg' },
  social: {},
});

test('GET /api/authors/:id/usage returns the referencing posts', async () => {
  const panel = await startPanel();
  try {
    const { status, body } = await panel.get('/api/authors/ignacio-garza/usage');
    assert.equal(status, 200);
    assert.equal(body.usageCount, 2);
  } finally {
    await panel.close();
  }
});

test('DELETE /api/authors/:id is blocked while referenced, allowed when not', async () => {
  const panel = await startPanel();
  try {
    const blocked = await panel.send('DELETE', '/api/authors/ignacio-garza');
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.usageCount, 2);

    await panel.send('POST', '/api/authors', authorBody('nadie', 'Nadie'));
    const allowed = await panel.send('DELETE', '/api/authors/nadie');
    assert.equal(allowed.status, 200);
  } finally {
    await panel.close();
  }
});
