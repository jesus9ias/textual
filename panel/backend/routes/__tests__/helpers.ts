/**
 * Test harness for the route-level tests: builds a throwaway content directory
 * (never the real blog content), boots the panel server on an ephemeral
 * localhost port, and returns a small client. Mirrors the on-disk layout the
 * blog uses: `<src>/site.config.json` and `<src>/content/{posts,categories,tags,authors}`.
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createStore } from '../../lib/store.ts';
import { createServer } from '../../server.ts';

export interface Panel {
  base: string;
  contentRoot: string;
  configRoot: string;
  close: () => Promise<void>;
  get: (p: string) => Promise<{ status: number; body: any }>;
  send: (method: string, p: string, body?: unknown) => Promise<{ status: number; body: any }>;
}

const post = (fm: Record<string, unknown>, body: string): string => {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
};

async function seed(configRoot: string): Promise<void> {
  const content = path.join(configRoot, 'content');
  for (const sub of ['posts/es', 'posts/en', 'categories', 'tags', 'authors']) {
    await mkdir(path.join(content, sub), { recursive: true });
  }

  await writeFile(
    path.join(configRoot, 'site.config.json'),
    JSON.stringify({ defaultLang: 'es', supportedLangs: ['es', 'en'], defaultCoverImage: '/x.jpg', siteUrl: 'https://x' }, null, 2),
  );

  const cat = (id: string, es: string, en: string) =>
    writeFile(
      path.join(content, 'categories', `${id}.json`),
      JSON.stringify({ es: { slug: id, title: es, description: '.' }, en: { slug: en, title: en, description: '.' } }, null, 2),
    );
  await cat('fisica', 'Física', 'physics');
  await cat('economia', 'Economía', 'economy');

  const tag = (id: string) =>
    writeFile(
      path.join(content, 'tags', `${id}.json`),
      JSON.stringify({ es: { slug: id, title: id }, en: { slug: id, title: id } }, null, 2),
    );
  await tag('relatividad');
  await tag('astrofisica');

  const author = (id: string, name: string) =>
    writeFile(
      path.join(content, 'authors', `${id}.json`),
      JSON.stringify({ es: { name, bio: '.', avatar: '/a.jpg' }, en: { name, bio: '.', avatar: '/a.jpg' }, social: {} }, null, 2),
    );
  await author('ignacio-garza', 'Ignacio Garza');
  await author('guest-writer', 'Guest Writer');

  const baseFm = (over: Record<string, unknown>) => ({
    translationId: 'black-holes-formation',
    lang: 'es',
    slug: 'como-se-forman-los-agujeros-negros',
    title: 'Agujeros negros',
    description: 'desc',
    authorId: 'ignacio-garza',
    categoryId: 'fisica',
    tagIds: ['astrofisica', 'relatividad'],
    coverImage: { src: '/c.jpg', alt: 'alt' },
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
    published: true,
    ...over,
  });

  await writeFile(path.join(content, 'posts/es/como-se-forman-los-agujeros-negros.md'), post(baseFm({}), 'cuerpo'));
  await writeFile(
    path.join(content, 'posts/en/how-black-holes-form.md'),
    post(baseFm({ lang: 'en', slug: 'how-black-holes-form', title: 'Black holes', tagIds: ['astrofisica'] }), 'body'),
  );
  await writeFile(
    path.join(content, 'posts/es/que-es-la-inflacion.md'),
    post(
      baseFm({
        translationId: 'inflation-basics',
        slug: 'que-es-la-inflacion',
        title: 'Inflación',
        categoryId: 'economia',
        authorId: 'guest-writer',
        tagIds: [],
      }),
      'cuerpo',
    ),
  );
}

export async function startPanel(): Promise<Panel> {
  const configRoot = await mkdtemp(path.join(tmpdir(), 'panel-routes-'));
  const contentRoot = path.join(configRoot, 'content');
  await seed(configRoot);

  const store = createStore({ contentRoot, configRoot });
  const server = createServer(store);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const parse = async (res: Response) => {
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  return {
    base,
    contentRoot,
    configRoot,
    close: () =>
      new Promise<void>((resolve) => server.close(() => rm(configRoot, { recursive: true, force: true }).then(() => resolve()))),
    get: (p) => fetch(`${base}${p}`).then(parse),
    send: (method, p, body) =>
      fetch(`${base}${p}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }).then(parse),
  };
}
