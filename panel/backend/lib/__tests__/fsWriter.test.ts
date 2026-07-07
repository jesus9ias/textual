/**
 * Unit tests for the atomic file writer and post serialization, one test per
 * `T-FS-*` id defined in panel/spec.md. Uses a real temp directory (never the
 * project's content dir).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { serializePost, postFilePath, writeFileAtomic, writePostFile } from '../fsWriter.ts';
import { postFrontmatterSchema } from '../integrity.ts';
import type { PostPayload } from '../types.ts';

const tmp = () => mkdtemp(path.join(tmpdir(), 'panel-fswriter-'));

const validPayload = (overrides: Partial<PostPayload> = {}): PostPayload => ({
  translationId: 'inflation-basics',
  lang: 'es',
  slug: 'que-es-la-inflacion',
  title: '¿Qué es la inflación?',
  description: 'Una nota breve sobre precios.',
  authorId: 'guest-writer',
  categoryId: 'economia',
  tagIds: ['relatividad'],
  coverImage: { src: '/assets/posts/inflation-basics/cover.jpg', alt: 'Precios subiendo' },
  createdAt: '2026-07-02',
  updatedAt: '2026-07-02',
  published: true,
  body: '## Precios\n\nCuerpo del post.',
  ...overrides,
});

test('T-FS-01: writes are atomic — an interrupted write leaves the original intact', async () => {
  const dir = await tmp();
  const target = path.join(dir, 'file.md');

  await writeFileAtomic(target, 'A');
  assert.equal(await readFile(target, 'utf8'), 'A');

  // Simulate a crash between the temp write and the rename.
  await assert.rejects(
    writeFileAtomic(target, 'B', {
      beforeRename: () => {
        throw new Error('simulated crash');
      },
    }),
  );

  // Original content survives, and no partial temp file is left behind.
  assert.equal(await readFile(target, 'utf8'), 'A');
  const leftovers = (await readdir(dir)).filter((f) => f !== 'file.md');
  assert.deepEqual(leftovers, []);

  // A normal write fully replaces the content (never partial).
  await writeFileAtomic(target, 'B');
  assert.equal(await readFile(target, 'utf8'), 'B');
});

test('T-FS-02: path construction sanitizes slug/lang and blocks traversal', async () => {
  const dir = await tmp();

  assert.throws(() => postFilePath(dir, 'es', '../../etc/passwd'));
  assert.throws(() => postFilePath(dir, '..', 'ok-slug'));

  await assert.rejects(writePostFile(dir, validPayload({ slug: '../../etc/passwd' })));

  // Nothing was written outside/inside as a result of the rejected write.
  const entries = await readdir(dir);
  assert.deepEqual(entries, []);
});

test('T-FS-03: post write produces frontmatter that round-trips and validates', async () => {
  const payload = validPayload();
  const output = serializePost(payload);

  // The body follows the frontmatter block.
  assert.ok(output.includes(payload.body));

  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(output);
  assert.ok(match, 'frontmatter block present');
  const parsed = parseYaml(match![1]);

  const { body: _body, ...frontmatter } = payload;
  assert.deepEqual(parsed, frontmatter);
  // And it satisfies the canonical post schema.
  assert.doesNotThrow(() => postFrontmatterSchema.parse(parsed));

  // Sanity: the writer actually persists a file at the sanitized path.
  const dir = await tmp();
  const written = await writePostFile(dir, payload);
  assert.equal(written, path.join(dir, 'posts', 'es', 'que-es-la-inflacion.md'));
  assert.equal(await readFile(written, 'utf8'), output);
});
