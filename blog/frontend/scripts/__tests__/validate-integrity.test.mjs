/**
 * Unit tests for the referential-integrity validator, one test per `T-VAL-*`
 * id defined in blog/spec.md. Tests exercise the pure `runIntegrityChecks`
 * function against fixture collections; no Astro build or filesystem access is
 * involved (file resolution is injected via `fileExists`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runIntegrityChecks, RULES } from '../validate-integrity.mjs';
import { validBaseline, post } from './fixtures.mjs';

/** All violations of a given rule. */
const of = (result, rule) => result.violations.filter((v) => v.rule === rule);
/** True when some violation's refs include every provided token. */
const hasRefs = (result, rule, ...tokens) =>
  of(result, rule).some((v) => tokens.every((t) => v.refs.includes(t)));

test('T-VAL-01: flags a post with a non-existent categoryId', () => {
  const set = validBaseline();
  post(set, 'es/inflation.md').data.categoryId = 'nonexistent';

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.unknownCategory).length, 1);
  assert.ok(hasRefs(result, RULES.unknownCategory, 'es/inflation.md', 'nonexistent'));
});

test('T-VAL-02: flags a post with a non-existent authorId', () => {
  const set = validBaseline();
  post(set, 'es/inflation.md').data.authorId = 'nonexistent';

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.unknownAuthor).length, 1);
  assert.ok(hasRefs(result, RULES.unknownAuthor, 'es/inflation.md', 'nonexistent'));
});

test('T-VAL-03: flags a post with a non-existent tagId', () => {
  const set = validBaseline();
  post(set, 'es/black-holes.md').data.tagIds = ['astrofisica', 'nonexistent'];

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.unknownTag).length, 1);
  assert.ok(hasRefs(result, RULES.unknownTag, 'es/black-holes.md', 'nonexistent'));
});

test('T-VAL-04: flags duplicate slugs within the same lang', () => {
  const set = validBaseline();
  // A second "es" post reusing an existing "es" slug.
  set.posts.push({
    id: 'es/duplicate.md',
    data: {
      translationId: 'duplicate-piece',
      lang: 'es',
      slug: 'como-se-forman-los-agujeros-negros',
      title: 'Duplicado',
      description: 'Descripción.',
      authorId: 'ignacio-garza',
      categoryId: 'fisica',
      tagIds: [],
      coverImage: { src: '/assets/posts/duplicate/cover.jpg', alt: 'Alt.' },
      createdAt: '2026-07-04',
      updatedAt: '2026-07-04',
      published: true,
    },
  });

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.duplicateSlug).length, 1);
  assert.ok(
    hasRefs(
      result,
      RULES.duplicateSlug,
      'es/black-holes.md',
      'es/duplicate.md',
      'como-se-forman-los-agujeros-negros',
    ),
  );
});

test('T-VAL-05: allows the same slug across different langs', () => {
  const set = validBaseline();
  // Force the "en" black-holes post to reuse the "es" slug string.
  post(set, 'en/black-holes.md').data.slug = 'como-se-forman-los-agujeros-negros';

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.duplicateSlug).length, 0);
});

test('T-VAL-06: flags duplicate translationId within the same lang', () => {
  const set = validBaseline();
  // A second "en" post sharing an existing "en" translationId.
  set.posts.push({
    id: 'en/another-black-holes.md',
    data: {
      translationId: 'black-holes-formation',
      lang: 'en',
      slug: 'another-black-holes',
      title: 'Another',
      description: 'Description.',
      authorId: 'ignacio-garza',
      categoryId: 'fisica',
      tagIds: [],
      coverImage: { src: '/assets/posts/another/cover.jpg', alt: 'Alt.' },
      createdAt: '2026-07-04',
      updatedAt: '2026-07-04',
      published: true,
    },
  });

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.duplicateTranslation).length, 1);
  assert.ok(
    hasRefs(result, RULES.duplicateTranslation, 'en/black-holes.md', 'en/another-black-holes.md'),
  );
});

test('T-VAL-07: allows one translationId across two different langs', () => {
  const set = validBaseline();
  // Baseline already shares "black-holes-formation" across es + en.
  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.duplicateTranslation).length, 0);
});

test('T-VAL-08: flags category mismatch between linked translations', () => {
  const set = validBaseline();
  post(set, 'en/black-holes.md').data.categoryId = 'economia';

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.categoryMismatch).length, 1);
  assert.ok(
    hasRefs(
      result,
      RULES.categoryMismatch,
      'es/black-holes.md',
      'en/black-holes.md',
      'fisica',
      'economia',
    ),
  );
});

test('T-VAL-09: flags defaultLang missing from supportedLangs', () => {
  const set = validBaseline();
  set.siteConfig.defaultLang = 'fr';

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.defaultLangNotSupported).length, 1);
  assert.ok(hasRefs(result, RULES.defaultLangNotSupported, 'fr'));
});

test('T-VAL-10: flags a missing defaultCoverImage file', () => {
  const set = validBaseline();
  set.fileExists = () => false;

  const result = runIntegrityChecks(set);

  assert.equal(of(result, RULES.missingDefaultCover).length, 1);
  assert.ok(hasRefs(result, RULES.missingDefaultCover, '/assets/site/default-cover.jpg'));
});

test('T-VAL-11: exits clean with a summary when everything is valid', () => {
  const set = validBaseline();
  const result = runIntegrityChecks(set);

  assert.equal(result.violations.length, 0);
  assert.deepEqual(result.summary, { posts: 3, categories: 2, tags: 2, authors: 2 });
});

test('T-VAL-12: reports every violation found, not just the first', () => {
  const set = validBaseline();
  // Three independent violations, none of which triggers a second rule.
  post(set, 'es/inflation.md').data.categoryId = 'nonexistent'; // unknown-category
  post(set, 'en/black-holes.md').data.authorId = 'nonexistent'; // unknown-author
  set.fileExists = () => false; // missing-default-cover-image

  const result = runIntegrityChecks(set);

  assert.equal(result.violations.length, 3);
});
