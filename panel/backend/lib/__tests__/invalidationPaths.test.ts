/**
 * Unit tests for the panel's invalidation-path core, one test per
 * `T-MANIFEST-*` id defined in panel/spec.md. Pure functions — no filesystem.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postInvalidationPaths,
  taxonomyInvalidationPaths,
  appendPaths,
  appendCutMarker,
  formatCutMarker,
} from '../invalidationPaths.ts';
import type {
  InvalidationCatalog,
  PostChangeInput,
  TaxonomyChangeInput,
} from '../invalidationPaths.ts';

const CATEGORY_SLUGS: Record<string, Record<string, string>> = {
  fisica: { es: 'fisica', en: 'physics' },
  economia: { es: 'economia', en: 'economy' },
};
const TAG_SLUGS: Record<string, Record<string, string>> = {
  relatividad: { es: 'relatividad', en: 'relativity' },
  astrofisica: { es: 'astrofisica', en: 'astrophysics' },
};
const catalog: InvalidationCatalog = {
  categorySlug: (id, lang) => CATEGORY_SLUGS[id]?.[lang],
  tagSlug: (id, lang) => TAG_SLUGS[id]?.[lang],
};

const post = (overrides: Partial<PostChangeInput> = {}): PostChangeInput => ({
  lang: 'es',
  slug: 'nuevo-post',
  categoryId: 'fisica',
  tagIds: ['relatividad'],
  authorId: 'ignacio-garza',
  ...overrides,
});

test('T-MANIFEST-01: post change emits its own path as a wildcard (the edge function rewrites it to .../index.html before the cache lookup)', () => {
  const paths = postInvalidationPaths(post(), catalog);
  assert.ok(paths.includes('/es/nuevo-post/*'));
});

test('T-MANIFEST-02: post change emits its full shell', () => {
  const paths = postInvalidationPaths(post(), catalog);
  const expected = [
    '/es/index.html',
    '/es/historico/*',
    '/sitemap.xml',
    '/es/rss.xml',
    '/es/categoria/fisica/*',
    '/es/tag/relatividad/*',
    '/es/autor/ignacio-garza/*',
  ];
  for (const path of expected) assert.ok(paths.includes(path), `should include ${path}`);
});

test('T-MANIFEST-03: post change does not emit unrelated category/tag paths', () => {
  const paths = postInvalidationPaths(post(), catalog);
  assert.ok(!paths.includes('/es/categoria/economia/*'));
  assert.ok(!paths.includes('/es/tag/astrofisica/*'));
  assert.ok(!paths.some((p) => p.startsWith('/en/')));
});

test('T-MANIFEST-04: taxonomy-only change emits only its own listing, per supported lang', () => {
  const taxonomy: TaxonomyChangeInput = { kind: 'category', id: 'fisica' };
  const paths = taxonomyInvalidationPaths(taxonomy, catalog, ['es', 'en']);
  assert.deepEqual(paths.sort(), ['/en/categoria/physics/*', '/es/categoria/fisica/*'].sort());
});

test('T-MANIFEST-05: deleting an entity computes paths from its pre-deletion state', () => {
  // The panel holds the entity's data in memory before removing it, so the
  // same builder applies unchanged — no history reconstruction needed.
  const preDeletionSnapshot: TaxonomyChangeInput = { kind: 'author', id: 'ignacio-garza' };
  const paths = taxonomyInvalidationPaths(preDeletionSnapshot, catalog, ['es', 'en']);
  assert.deepEqual(paths.sort(), ['/en/autor/ignacio-garza/*', '/es/autor/ignacio-garza/*'].sort());
});

test('T-MANIFEST-06: appending a path already pending since the last cut marker is a no-op, new paths still land', () => {
  const manifest = ['---2026/07/01', '/es/nuevo-post'];
  const updated = appendPaths(manifest, ['/es/nuevo-post', '/es/otro-post']);
  assert.deepEqual(updated, ['---2026/07/01', '/es/nuevo-post', '/es/otro-post']);
});

test('T-MANIFEST-07: with no cut marker yet, dedup checks the whole file', () => {
  const manifest = ['/es/nuevo-post'];
  const updated = appendPaths(manifest, ['/es/nuevo-post', '/es/otro-post']);
  assert.deepEqual(updated, ['/es/nuevo-post', '/es/otro-post']);
});

test('T-MANIFEST-08: publish-cut appends a correctly formatted marker line', () => {
  const manifest = ['/es/nuevo-post'];
  const date = new Date(2026, 6, 10); // month is 0-indexed: July
  const updated = appendCutMarker(manifest, date);
  assert.deepEqual(updated, ['/es/nuevo-post', '---2026/07/10']);
  assert.equal(formatCutMarker(date), '---2026/07/10');
});
