/**
 * Route-level tests for /api/posts, exercising the panel Gherkin scenarios for
 * the publish flow and translation linking, over real HTTP against a temp
 * fixture content directory.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startPanel } from './helpers.ts';

const draft = (over: Record<string, unknown> = {}) => ({
  lang: 'es',
  slug: 'un-post-nuevo',
  title: 'Un post nuevo',
  description: 'desc',
  authorId: 'ignacio-garza',
  categoryId: 'fisica',
  tagIds: ['relatividad'],
  coverImage: { src: '/c.jpg', alt: 'alt' },
  createdAt: '2026-07-05',
  updatedAt: '2026-07-05',
  published: true,
  body: 'cuerpo',
  ...over,
});

test('GET /api/posts lists posts and flags untranslated ones', async () => {
  const panel = await startPanel();
  try {
    const { status, body } = await panel.get('/api/posts');
    assert.equal(status, 200);
    assert.equal(body.posts.length, 3);
    const inflation = body.posts.find((p: any) => p.slug === 'que-es-la-inflacion');
    assert.deepEqual(inflation.missingTranslations, ['en']);
    const es = body.posts.find((p: any) => p.slug === 'como-se-forman-los-agujeros-negros');
    assert.deepEqual(es.missingTranslations, []);
  } finally {
    await panel.close();
  }
});

test('POST /api/posts writes a validated post and generates a translationId', async () => {
  const panel = await startPanel();
  try {
    const { status, body } = await panel.send('POST', '/api/posts', { payload: draft() });
    assert.equal(status, 201);
    assert.match(body.translationId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);

    const read = await panel.get(`/api/posts/${body.id}`);
    assert.equal(read.status, 200);
    assert.equal(read.body.post.slug, 'un-post-nuevo');
    assert.equal(read.body.post.body.trim(), 'cuerpo');
  } finally {
    await panel.close();
  }
});

test('POST /api/posts rejects an invalid categoryId and writes nothing', async () => {
  const panel = await startPanel();
  try {
    const { status } = await panel.send('POST', '/api/posts', { payload: draft({ categoryId: 'nope' }) });
    assert.equal(status, 400);
    const list = await panel.get('/api/posts');
    assert.equal(list.body.posts.length, 3); // unchanged
  } finally {
    await panel.close();
  }
});

test('POST /api/posts rejects a duplicate slug within the same lang', async () => {
  const panel = await startPanel();
  try {
    const { status } = await panel.send('POST', '/api/posts', {
      payload: draft({ slug: 'que-es-la-inflacion', categoryId: 'economia', authorId: 'guest-writer' }),
    });
    assert.equal(status, 409);
  } finally {
    await panel.close();
  }
});

test('POST /api/posts with a translation link copies the translationId and warns on category mismatch', async () => {
  const panel = await startPanel();
  try {
    const { status, body } = await panel.send('POST', '/api/posts', {
      payload: draft({ lang: 'en', slug: 'what-is-inflation', categoryId: 'fisica' }),
      linkTo: 'es:que-es-la-inflacion', // inflation-basics, categoryId economia
    });
    assert.equal(status, 201);
    assert.equal(body.translationId, 'inflation-basics');
    assert.equal(body.warning, true);
  } finally {
    await panel.close();
  }
});

test('DELETE /api/posts/:id removes the post file', async () => {
  const panel = await startPanel();
  try {
    const del = await panel.send('DELETE', '/api/posts/es:que-es-la-inflacion');
    assert.equal(del.status, 200);
    const read = await panel.get('/api/posts/es:que-es-la-inflacion');
    assert.equal(read.status, 404);
  } finally {
    await panel.close();
  }
});
