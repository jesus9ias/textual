/**
 * Unit tests for post field validation, one test per `T-FIELD-*` id defined in
 * panel/spec.md. Mirrors the hard publish gates (title, description length,
 * cover alt) that the panel enforces before a write.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePostFields } from '../integrity.ts';
import type { PostPayload } from '../types.ts';

const validPayload = (overrides: Partial<PostPayload> = {}): PostPayload => ({
  translationId: 'inflation-basics',
  lang: 'es',
  slug: 'que-es-la-inflacion',
  title: '¿Qué es la inflación?',
  description: 'Una nota breve.',
  authorId: 'guest-writer',
  categoryId: 'economia',
  tagIds: [],
  coverImage: { src: '/assets/posts/inflation-basics/cover.jpg', alt: 'Alt.' },
  createdAt: '2026-07-02',
  updatedAt: '2026-07-02',
  published: true,
  body: 'Cuerpo.',
  ...overrides,
});

test('T-FIELD-01: rejects an empty title', () => {
  assert.equal(validatePostFields(validPayload({ title: '' })).ok, false);
});

test('T-FIELD-02: rejects a description over 160 characters', () => {
  assert.equal(validatePostFields(validPayload({ description: 'x'.repeat(161) })).ok, false);
});

test('T-FIELD-03: rejects an empty cover image alt', () => {
  assert.equal(
    validatePostFields(validPayload({ coverImage: { src: '/a.jpg', alt: '' } })).ok,
    false,
  );
});

test('T-FIELD-04: accepts a well-formed post payload', () => {
  assert.equal(validatePostFields(validPayload()).ok, true);
});
