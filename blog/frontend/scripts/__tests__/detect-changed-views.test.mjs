/**
 * Unit tests for the change-detection core, one test per `T-DIFF-*` id defined
 * in blog/spec.md. Tests exercise the pure `computeChangedViews` function; no
 * git is involved (change descriptors are supplied directly).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChangedViews } from '../detect-changed-views.mjs';
import {
  postPath,
  homePath,
  historicoWildcard,
  categoryWildcard,
  tagWildcard,
  authorWildcard,
  rssPath,
  ROOT_ROUTES,
} from '../../src/lib/routing.mjs';

const supportedLangs = ['es', 'en'];

const CATEGORY_SLUGS = {
  fisica: { es: 'fisica', en: 'physics' },
  economia: { es: 'economia', en: 'economy' },
};
const TAG_SLUGS = {
  relatividad: { es: 'relatividad', en: 'relativity' },
  astrofisica: { es: 'astrofisica', en: 'astrophysics' },
};
const catalog = {
  categorySlug: (id, lang) => CATEGORY_SLUGS[id]?.[lang],
  tagSlug: (id, lang) => TAG_SLUGS[id]?.[lang],
};

const newPost = (overrides = {}) => ({
  status: 'A',
  lang: 'es',
  slug: 'nuevo-post',
  categoryId: 'fisica',
  tagIds: ['relatividad'],
  authorId: 'ignacio-garza',
  ...overrides,
});

const run = (changedPosts = [], changedTaxonomies = []) =>
  computeChangedViews({ changedPosts, changedTaxonomies, catalog, supportedLangs });

test('T-DIFF-01: new post maps to its own entries path only', () => {
  const { entries } = run([newPost()]);
  assert.deepEqual(entries, [postPath('es', 'nuevo-post')]);
});

test('T-DIFF-02: new post maps to its directly related shell paths', () => {
  const { shell } = run([newPost()]);
  const expected = [
    homePath('es'),
    historicoWildcard('es'),
    ROOT_ROUTES.sitemap,
    rssPath('es'),
    categoryWildcard('es', 'fisica'),
    tagWildcard('es', 'relatividad'),
    authorWildcard('es', 'ignacio-garza'),
  ];
  for (const path of expected) assert.ok(shell.includes(path), `shell should include ${path}`);
});

test('T-DIFF-03: new post does not affect unrelated category/tag listings', () => {
  const { shell } = run([newPost()]);
  assert.ok(!shell.includes(categoryWildcard('es', 'economia')));
  assert.ok(!shell.includes(tagWildcard('es', 'astrofisica')));
  // Also nothing for the other language, since the post is es-only.
  assert.ok(!shell.some((p) => p.startsWith('/en/')));
});

test('T-DIFF-04: edited post updates both its entry and its shell dependents', () => {
  const { entries, shell } = run([newPost({ status: 'M' })]);
  assert.deepEqual(entries, [postPath('es', 'nuevo-post')]);
  assert.ok(shell.includes(categoryWildcard('es', 'fisica')));
  assert.ok(shell.includes(homePath('es')));
  assert.ok(shell.includes(rssPath('es')));
});

test('T-DIFF-05: editing a taxonomy JSON with no post changes affects only its own listing', () => {
  const { entries, shell } = run([], [{ kind: 'category', id: 'fisica' }]);
  assert.equal(entries.length, 0);
  assert.deepEqual(
    shell.sort(),
    [categoryWildcard('es', 'fisica'), categoryWildcard('en', 'physics')].sort(),
  );
});

test('T-DIFF-06: removed post is included in invalidation even though no new file is produced', () => {
  const { entries, shell } = run([newPost({ status: 'D' })]);
  assert.ok(entries.includes(postPath('es', 'nuevo-post')));
  assert.ok(shell.includes(categoryWildcard('es', 'fisica')));
  assert.ok(shell.includes(authorWildcard('es', 'ignacio-garza')));
});
