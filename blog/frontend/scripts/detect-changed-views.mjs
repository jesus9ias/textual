/**
 * Determines the minimal set of output paths that must be invalidated for a
 * given push, so a single new/edited/removed post never triggers a full-site
 * CloudFront invalidation.
 *
 * Mechanism (see blog/spec.md Decisions Log): git-based. The pure
 * `computeChangedViews` core maps a set of change descriptors to two path lists
 * (`entries`, `shell`); the git wrapper below builds those descriptors from
 * `git diff`/`git show`, reading the prior version of modified/removed posts
 * that Astro's `getCollection()` cannot see. The core is unit-tested against
 * fixtures (T-DIFF-*) with no git involved.
 */
import {
  postPath,
  homePath,
  historicoWildcard,
  categoryWildcard,
  tagWildcard,
  authorWildcard,
  rssPath,
  ROOT_ROUTES,
} from '../src/lib/routing.mjs';

/**
 * @typedef {object} ChangedPost
 * @property {'A'|'M'|'D'} status
 * @property {string} lang
 * @property {string} slug
 * @property {string} categoryId
 * @property {string[]} tagIds
 * @property {string} authorId
 */

/**
 * @typedef {object} ChangedTaxonomy
 * @property {'category'|'tag'|'author'} kind
 * @property {string} id
 */

/**
 * @typedef {object} Catalog
 * @property {(id: string, lang: string) => string|undefined} categorySlug
 * @property {(id: string, lang: string) => string|undefined} tagSlug
 */

function addPostShell(shell, post, catalog) {
  shell.add(homePath(post.lang));
  shell.add(historicoWildcard(post.lang));
  shell.add(ROOT_ROUTES.sitemap);
  shell.add(rssPath(post.lang));

  const categorySlug = catalog.categorySlug(post.categoryId, post.lang);
  if (categorySlug) shell.add(categoryWildcard(post.lang, categorySlug));

  for (const tagId of post.tagIds ?? []) {
    const tagSlug = catalog.tagSlug(tagId, post.lang);
    if (tagSlug) shell.add(tagWildcard(post.lang, tagSlug));
  }

  // Authors use their canonical id as the URL slug (no localized slug).
  shell.add(authorWildcard(post.lang, post.authorId));
}

function addTaxonomyShell(shell, taxonomy, catalog, supportedLangs) {
  for (const lang of supportedLangs) {
    if (taxonomy.kind === 'category') {
      const slug = catalog.categorySlug(taxonomy.id, lang);
      if (slug) shell.add(categoryWildcard(lang, slug));
    } else if (taxonomy.kind === 'tag') {
      const slug = catalog.tagSlug(taxonomy.id, lang);
      if (slug) shell.add(tagWildcard(lang, slug));
    } else {
      shell.add(authorWildcard(lang, taxonomy.id));
    }
  }
}

/**
 * Pure core: maps change descriptors to `{ entries, shell }` invalidation paths.
 *
 * @param {object} input
 * @param {ChangedPost[]} input.changedPosts
 * @param {ChangedTaxonomy[]} input.changedTaxonomies
 * @param {Catalog} input.catalog
 * @param {string[]} input.supportedLangs
 * @returns {{ entries: string[], shell: string[] }}
 */
export function computeChangedViews({ changedPosts, changedTaxonomies, catalog, supportedLangs }) {
  const entries = new Set();
  const shell = new Set();

  for (const post of changedPosts) {
    // A removed post still needs its (now stale) entry path invalidated.
    entries.add(postPath(post.lang, post.slug));
    addPostShell(shell, post, catalog);
  }

  // A category/tag/author edited directly (no post change) invalidates only its
  // own listing (blog/spec.md T-DIFF-05).
  for (const taxonomy of changedTaxonomies) {
    addTaxonomyShell(shell, taxonomy, catalog, supportedLangs);
  }

  return { entries: [...entries], shell: [...shell] };
}

// --- git wrapper (real CI runs) --------------------------------------------

async function defaultLoadChanges({ base, head }) {
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  const { readFileSync, readdirSync } = await import('node:fs');
  const { parseFrontmatter } = await import('./lib/frontmatter.mjs');

  const git = (args) => execFileSync('git', args, { encoding: 'utf8' });
  const cwd = process.cwd();
  const contentDir = path.join(cwd, 'src', 'content');
  const siteConfig = JSON.parse(readFileSync(path.join(cwd, 'src', 'site.config.json'), 'utf8'));
  const supportedLangs = siteConfig.supportedLangs;

  // Build a catalog of localized slugs from the CURRENT working tree.
  const readDataDir = (name) => {
    const dir = path.join(contentDir, name);
    const map = new Map();
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const id = file.replace(/\.json$/, '');
      map.set(id, JSON.parse(readFileSync(path.join(dir, file), 'utf8')));
    }
    return map;
  };
  const categories = readDataDir('categories');
  const tags = readDataDir('tags');
  /** @type {Catalog} */
  const catalog = {
    categorySlug: (id, lang) => categories.get(id)?.[lang]?.slug,
    tagSlug: (id, lang) => tags.get(id)?.[lang]?.slug,
  };

  const diff = git(['diff', '--name-status', base, head, '--', 'src/content', 'src/site.config.json']);
  const changedPosts = [];
  const changedTaxonomies = [];

  for (const line of diff.split('\n').filter(Boolean)) {
    const [rawStatus, filePath] = line.split(/\t/);
    const status = rawStatus[0]; // A | M | D | R...

    if (/^src\/content\/posts\/.+\.md$/.test(filePath)) {
      // Read the relevant version: head for A/M, base for D.
      const ref = status === 'D' ? base : head;
      const content = git(['show', `${ref}:${filePath}`]);
      const fm = parseFrontmatter(content);
      changedPosts.push({
        status,
        lang: fm.lang,
        slug: fm.slug,
        categoryId: fm.categoryId,
        tagIds: fm.tagIds ?? [],
        authorId: fm.authorId,
      });
    } else {
      const taxonomyMatch = /^src\/content\/(categories|tags|authors)\/(.+)\.json$/.exec(filePath);
      if (taxonomyMatch) {
        const kind = { categories: 'category', tags: 'tag', authors: 'author' }[taxonomyMatch[1]];
        changedTaxonomies.push({ kind, id: taxonomyMatch[2] });
      }
    }
  }

  return { changedPosts, changedTaxonomies, catalog, supportedLangs };
}

async function main() {
  const base = process.env.BASE_SHA ?? process.argv[2];
  const head = process.env.HEAD_SHA ?? process.argv[3] ?? 'HEAD';
  if (!base) {
    console.error('Usage: detect-changed-views.mjs <base> [head]  (or BASE_SHA/HEAD_SHA env)');
    process.exitCode = 1;
    return;
  }
  const input = await defaultLoadChanges({ base, head });
  const result = computeChangedViews(input);
  process.stdout.write(JSON.stringify(result));
}

const { pathToFileURL } = await import('node:url');
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
