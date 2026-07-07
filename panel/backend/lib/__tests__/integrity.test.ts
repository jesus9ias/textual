/**
 * Unit tests for the panel's write-time referential-integrity core, one test
 * per `T-INT-*` id defined in panel/spec.md. Pure functions over in-memory
 * snapshots — no filesystem, no HTTP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePostWrite,
  canDeleteCategory,
  canDeleteAuthor,
  planTagDeletion,
  checkTranslationCategory,
  translationLinkCandidates,
  generateTranslationId,
} from '../integrity.ts';
import type { ContentSnapshot, PostPayload, PostRef } from '../types.ts';

const postRef = (overrides: Partial<PostRef>): PostRef => ({
  translationId: 'black-holes-formation',
  lang: 'es',
  slug: 'como-se-forman-los-agujeros-negros',
  categoryId: 'fisica',
  authorId: 'ignacio-garza',
  tagIds: ['astrofisica', 'relatividad'],
  ...overrides,
});

const snapshot = (posts: PostRef[] = []): ContentSnapshot => ({
  posts,
  categoryIds: ['fisica', 'economia'],
  authorIds: ['ignacio-garza', 'guest-writer'],
  tagIds: ['astrofisica', 'relatividad'],
});

const validPayload = (overrides: Partial<PostPayload> = {}): PostPayload => ({
  translationId: 'inflation-basics',
  lang: 'es',
  slug: 'que-es-la-inflacion',
  title: '¿Qué es la inflación?',
  description: 'Una nota breve.',
  authorId: 'guest-writer',
  categoryId: 'economia',
  tagIds: ['relatividad'],
  coverImage: { src: '/assets/posts/inflation-basics/cover.jpg', alt: 'Alt.' },
  createdAt: '2026-07-02',
  updatedAt: '2026-07-02',
  published: true,
  body: 'Cuerpo.',
  ...overrides,
});

test('T-INT-01: rejects a post write with a non-existent categoryId', () => {
  const result = validatePostWrite(validPayload({ categoryId: 'nonexistent' }), snapshot());
  assert.equal(result.ok, false);
});

test('T-INT-02: rejects a post write with a non-existent authorId', () => {
  const result = validatePostWrite(validPayload({ authorId: 'nonexistent' }), snapshot());
  assert.equal(result.ok, false);
});

test('T-INT-03: rejects a post write with a non-existent tagId', () => {
  const result = validatePostWrite(validPayload({ tagIds: ['relatividad', 'nonexistent'] }), snapshot());
  assert.equal(result.ok, false);
});

test('T-INT-04: rejects a duplicate slug within the same lang', () => {
  const existing = snapshot([postRef({ lang: 'es', slug: 'mi-post' })]);
  const result = validatePostWrite(validPayload({ lang: 'es', slug: 'mi-post' }), existing);
  assert.equal(result.ok, false);
});

test('T-INT-05: accepts a valid post write', () => {
  const result = validatePostWrite(validPayload(), snapshot());
  assert.equal(result.ok, true);
});

test('T-INT-06: blocks category deletion when referenced', () => {
  const posts = [postRef({ categoryId: 'fisica' }), postRef({ categoryId: 'fisica' })];
  const result = canDeleteCategory('fisica', posts);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.usageCount, 2);
});

test('T-INT-07: allows category deletion when unreferenced', () => {
  const result = canDeleteCategory('economia', [postRef({ categoryId: 'fisica' })]);
  assert.equal(result.ok, true);
});

test('T-INT-08: blocks author deletion when referenced', () => {
  const posts = [postRef({ authorId: 'ignacio-garza' })];
  const result = canDeleteAuthor('ignacio-garza', posts);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.usageCount, 1);
});

test('T-INT-09: allows author deletion when unreferenced', () => {
  const result = canDeleteAuthor('guest-writer', [postRef({ authorId: 'ignacio-garza' })]);
  assert.equal(result.ok, true);
});

test('T-INT-10: tag deletion is always allowed and returns the usage count', () => {
  const posts = [
    postRef({ tagIds: ['relatividad'] }),
    postRef({ tagIds: ['relatividad', 'astrofisica'] }),
    postRef({ tagIds: ['astrofisica'] }),
  ];
  const result = planTagDeletion('relatividad', posts);
  assert.equal(result.ok, true);
  assert.equal(result.usageCount, 2);
});

test('T-INT-11: tag deletion cascades reference removal', () => {
  const posts = [
    postRef({ id: 'p1', tagIds: ['relatividad', 'astrofisica'] }),
    postRef({ id: 'p2', tagIds: ['relatividad'] }),
    postRef({ id: 'p3', tagIds: ['relatividad', 'astrofisica'] }),
  ];
  const result = planTagDeletion('relatividad', posts);
  assert.equal(result.usageCount, 3);
  assert.equal(result.updatedPosts.length, 3);
  for (const p of result.updatedPosts) {
    assert.ok(!p.tagIds.includes('relatividad'));
  }
});

test('T-INT-12: flags a category mismatch on translation link (non-blocking)', () => {
  const result = checkTranslationCategory('fisica', 'economia');
  assert.equal(result.ok, true);
  assert.equal(result.warning, true);

  const matching = checkTranslationCategory('fisica', 'fisica');
  assert.equal(matching.warning, false);
});

test('T-INT-13: filters translation-link candidates to posts missing the target lang', () => {
  const posts = [
    postRef({ id: 'es-solo', translationId: 'solo', lang: 'es' }),
    postRef({ id: 'es-pair', translationId: 'pair', lang: 'es' }),
    postRef({ id: 'en-pair', translationId: 'pair', lang: 'en' }),
  ];
  const candidates = translationLinkCandidates(posts, 'en');
  const ids = candidates.map((p) => p.id);
  assert.deepEqual(ids, ['es-solo']); // "pair" already has an "en" version
});

test('T-INT-14: generates a new readable translationId not already in use', () => {
  const existing = ['inflation-basics', 'mi-nuevo-post'];
  const id = generateTranslationId(existing, 'Mi Nuevo Post');
  assert.ok(id.length > 0);
  assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(!existing.includes(id));
});
