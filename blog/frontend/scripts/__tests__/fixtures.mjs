/**
 * Fixture content set for the integrity-validation test suite.
 *
 * Fixtures are shaped exactly like Astro's `getCollection()` output — arrays of
 * `{ id, data }` entries — so the pure `runIntegrityChecks` function is tested
 * against the same structure it receives in CI, without a second Markdown/JSON
 * parser (see blog/spec.md Decisions Log). `validBaseline()` returns a fresh,
 * fully-consistent set on each call; individual tests derive intentionally
 * broken variants from it.
 */

/** A fully-consistent baseline that passes every T-VAL-* check. */
export function validBaseline() {
  const categories = [
    {
      id: 'fisica',
      data: {
        es: { slug: 'fisica', title: 'Física', description: 'Física.' },
        en: { slug: 'physics', title: 'Physics', description: 'Physics.' },
      },
    },
    {
      id: 'economia',
      data: {
        es: { slug: 'economia', title: 'Economía', description: 'Economía.' },
        en: { slug: 'economy', title: 'Economy', description: 'Economy.' },
      },
    },
  ];

  const tags = [
    {
      id: 'relatividad',
      data: {
        es: { slug: 'relatividad', title: 'Relatividad' },
        en: { slug: 'relativity', title: 'Relativity' },
      },
    },
    {
      id: 'astrofisica',
      data: {
        es: { slug: 'astrofisica', title: 'Astrofísica' },
        en: { slug: 'astrophysics', title: 'Astrophysics' },
      },
    },
  ];

  const authors = [
    {
      id: 'ignacio-garza',
      data: {
        es: { name: 'Ignacio Garza', bio: 'Bio.', avatar: '/assets/authors/ignacio.jpg' },
        en: { name: 'Ignacio Garza', bio: 'Bio.', avatar: '/assets/authors/ignacio.jpg' },
        social: {},
      },
    },
    {
      id: 'guest-writer',
      data: {
        es: { name: 'Guest Writer', bio: 'Bio.', avatar: '/assets/authors/guest.jpg' },
        en: { name: 'Guest Writer', bio: 'Bio.', avatar: '/assets/authors/guest.jpg' },
        social: {},
      },
    },
  ];

  const posts = [
    {
      id: 'es/black-holes.md',
      data: {
        translationId: 'black-holes-formation',
        lang: 'es',
        slug: 'como-se-forman-los-agujeros-negros',
        title: '¿Cómo se forman los agujeros negros?',
        description: 'Descripción.',
        authorId: 'ignacio-garza',
        categoryId: 'fisica',
        tagIds: ['astrofisica', 'relatividad'],
        coverImage: { src: '/assets/posts/black-holes-formation/cover.jpg', alt: 'Alt.' },
        createdAt: '2026-07-01',
        updatedAt: '2026-07-03',
        published: true,
      },
    },
    {
      id: 'en/black-holes.md',
      data: {
        translationId: 'black-holes-formation',
        lang: 'en',
        slug: 'how-black-holes-form',
        title: 'How do black holes form?',
        description: 'Description.',
        authorId: 'ignacio-garza',
        categoryId: 'fisica',
        tagIds: ['astrofisica'],
        coverImage: { src: '/assets/posts/black-holes-formation/cover.jpg', alt: 'Alt.' },
        createdAt: '2026-07-01',
        updatedAt: '2026-07-03',
        published: true,
      },
    },
    {
      id: 'es/inflation.md',
      data: {
        translationId: 'inflation-basics',
        lang: 'es',
        slug: 'que-es-la-inflacion',
        title: '¿Qué es la inflación?',
        description: 'Descripción.',
        authorId: 'guest-writer',
        categoryId: 'economia',
        tagIds: [],
        coverImage: { src: '/assets/posts/inflation-basics/cover.jpg', alt: 'Alt.' },
        createdAt: '2026-07-02',
        updatedAt: '2026-07-02',
        published: true,
      },
    },
  ];

  const siteConfig = {
    defaultLang: 'es',
    supportedLangs: ['es', 'en'],
    defaultCoverImage: '/assets/site/default-cover.jpg',
    siteUrl: 'https://textual.example.com',
  };

  /** Baseline: the default cover image resolves. */
  const fileExists = (publicPath) => publicPath === siteConfig.defaultCoverImage;

  return { posts, categories, tags, authors, siteConfig, fileExists };
}

/** Convenience: find one post entry in a fixture set by its id. */
export function post(set, id) {
  const entry = set.posts.find((p) => p.id === id);
  if (!entry) throw new Error(`Fixture post not found: ${id}`);
  return entry;
}
