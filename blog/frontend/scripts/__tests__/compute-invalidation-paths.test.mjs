/**
 * Unit tests for the invalidation-path core, one test per `T-INV-*` id
 * defined in blog/spec.md. Tests exercise the pure `computeInvalidationPaths`
 * function directly against manifest line arrays; no filesystem is involved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInvalidationPaths } from '../compute-invalidation-paths.mjs';

const run = (manifestLines, alwaysInvalidate = []) =>
  computeInvalidationPaths({ manifestLines, alwaysInvalidate });

test('T-INV-01: only lines after the last cut marker are included', () => {
  const result = run(['/es/a', '/es/b', '---2026/07/01', '/es/c', '/es/d']);
  assert.ok(result.includes('/es/c'));
  assert.ok(result.includes('/es/d'));
  assert.ok(!result.includes('/es/a'));
  assert.ok(!result.includes('/es/b'));
});

test('T-INV-02: no cut marker present treats the entire file as pending', () => {
  const result = run(['/es/a', '/es/b']);
  assert.deepEqual(result.sort(), ['/es/a', '/es/b']);
});

test('T-INV-03: duplicate paths collapse to a single entry', () => {
  const result = run(['---2026/07/01', '/es/a', '/es/a', '/es/a']);
  assert.deepEqual(result, ['/es/a']);
});

test('T-INV-04: always-invalidate paths are included even when nothing is pending', () => {
  const alwaysInvalidate = ['/es/', '/en/', '/sitemap.xml', '/robots.txt'];
  const result = run(['/es/a', '---2026/07/01'], alwaysInvalidate);
  assert.deepEqual(result.sort(), [...alwaysInvalidate].sort());
});

test('T-INV-05: cut marker lines never appear in the output', () => {
  const result = run(['/es/a', '---2026/07/01', '/es/b']);
  assert.ok(!result.some((line) => line.startsWith('---')));
});

test('T-INV-06: only the most recent cut marker is honored', () => {
  const result = run(['---2026/07/01', '/es/a', '---2026/07/05', '/es/b']);
  assert.deepEqual(result, ['/es/b']);
});
