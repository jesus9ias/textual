/**
 * Referential-integrity validation for the blog's content.
 *
 * Zod (in `src/content.config.ts`) validates the *shape* of each entry. This
 * script validates the *cross-references* Zod cannot express — categoryId /
 * authorId / tagIds resolution, slug and translationId uniqueness per language,
 * category coherence across linked translations, and the site config's
 * language / default-cover consistency. It is the CI gate that runs after
 * `astro sync`; `astro build` must not run when it fails.
 *
 * Design: the checks live in a pure function, `runIntegrityChecks`, that
 * receives collections shaped like `getCollection()` output (`{ id, data }`)
 * plus the site config and a `fileExists` resolver. The CLI wrapper at the
 * bottom loads those from the committed content files via the shared raw reader
 * (`lib/content-reader.mjs`), so the gate runs as a standalone Node step in CI.
 * The pure core stays unit-testable against fixtures either way.
 *
 * On raw reading vs. `getCollection()`: `astro:content` is a build-only virtual
 * module and is not importable from a standalone Node process, so the CI gate
 * reads the same committed files Astro reads. A single shared raw reader serves
 * both CI scripts, so there is one parser, not two (see blog/spec.md and the
 * monorepo Decisions Log, 2026-07-06).
 */

/** Semantic rule codes. Declared once — never inlined at a call site. */
export const RULES = Object.freeze({
  unknownCategory: 'unknown-category',
  unknownAuthor: 'unknown-author',
  unknownTag: 'unknown-tag',
  duplicateSlug: 'duplicate-slug-in-lang',
  duplicateTranslation: 'duplicate-translation-in-lang',
  categoryMismatch: 'translation-category-mismatch',
  defaultLangNotSupported: 'default-lang-not-supported',
  missingDefaultCover: 'missing-default-cover-image',
});

/** Builds a violation record. `refs` holds the tokens error messages point at. */
function violation(rule, message, refs) {
  return { rule, message, refs };
}

function checkUnknownReferences(posts, categories, tags, authors) {
  const violations = [];
  const categoryIds = new Set(categories.map((c) => c.id));
  const tagIds = new Set(tags.map((t) => t.id));
  const authorIds = new Set(authors.map((a) => a.id));

  for (const p of posts) {
    const { categoryId, authorId, tagIds: postTagIds } = p.data;

    if (!categoryIds.has(categoryId)) {
      violations.push(
        violation(
          RULES.unknownCategory,
          `Post "${p.id}" references unknown categoryId "${categoryId}".`,
          [p.id, categoryId],
        ),
      );
    }
    if (!authorIds.has(authorId)) {
      violations.push(
        violation(
          RULES.unknownAuthor,
          `Post "${p.id}" references unknown authorId "${authorId}".`,
          [p.id, authorId],
        ),
      );
    }
    for (const tagId of postTagIds ?? []) {
      if (!tagIds.has(tagId)) {
        violations.push(
          violation(
            RULES.unknownTag,
            `Post "${p.id}" references unknown tagId "${tagId}".`,
            [p.id, tagId],
          ),
        );
      }
    }
  }
  return violations;
}

/** Groups posts by a composite key, returning only the groups with >1 member. */
function collisions(posts, keyOf) {
  const groups = new Map();
  for (const p of posts) {
    const key = keyOf(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.entries()].filter(([, members]) => members.length > 1);
}

function checkDuplicateSlugs(posts) {
  return collisions(posts, (p) => `${p.data.lang}::${p.data.slug}`).map(([, members]) => {
    const slug = members[0].data.slug;
    const lang = members[0].data.lang;
    const ids = members.map((m) => m.id);
    return violation(
      RULES.duplicateSlug,
      `Duplicate slug "${slug}" in lang "${lang}" across posts: ${ids.join(', ')}.`,
      [...ids, slug],
    );
  });
}

function checkDuplicateTranslations(posts) {
  return collisions(posts, (p) => `${p.data.lang}::${p.data.translationId}`).map(([, members]) => {
    const translationId = members[0].data.translationId;
    const lang = members[0].data.lang;
    const ids = members.map((m) => m.id);
    return violation(
      RULES.duplicateTranslation,
      `Duplicate translationId "${translationId}" in lang "${lang}" across posts: ${ids.join(', ')}.`,
      [...ids, translationId],
    );
  });
}

function checkTranslationCategoryCoherence(posts) {
  const violations = [];
  const groups = new Map();
  for (const p of posts) {
    const key = p.data.translationId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const [, members] of groups) {
    const distinctCategories = [...new Set(members.map((m) => m.data.categoryId))];
    if (distinctCategories.length > 1) {
      const ids = members.map((m) => m.id);
      violations.push(
        violation(
          RULES.categoryMismatch,
          `Linked translations disagree on categoryId (${distinctCategories.join(
            ', ',
          )}) across posts: ${ids.join(', ')}.`,
          [...ids, ...distinctCategories],
        ),
      );
    }
  }
  return violations;
}

function checkSiteConfig(siteConfig, fileExists) {
  const violations = [];
  const { defaultLang, supportedLangs, defaultCoverImage } = siteConfig;

  if (!supportedLangs.includes(defaultLang)) {
    violations.push(
      violation(
        RULES.defaultLangNotSupported,
        `defaultLang "${defaultLang}" is not in supportedLangs [${supportedLangs.join(', ')}].`,
        [defaultLang],
      ),
    );
  }
  if (!fileExists(defaultCoverImage)) {
    violations.push(
      violation(
        RULES.missingDefaultCover,
        `defaultCoverImage "${defaultCoverImage}" does not resolve to an existing file.`,
        [defaultCoverImage],
      ),
    );
  }
  return violations;
}

/**
 * Runs every referential-integrity check and returns all violations found (not
 * just the first) plus an entity-count summary.
 *
 * @param {object} input
 * @param {Array<{id:string,data:object}>} input.posts
 * @param {Array<{id:string,data:object}>} input.categories
 * @param {Array<{id:string,data:object}>} input.tags
 * @param {Array<{id:string,data:object}>} input.authors
 * @param {object} input.siteConfig
 * @param {(publicPath:string)=>boolean} input.fileExists
 */
export function runIntegrityChecks({ posts, categories, tags, authors, siteConfig, fileExists }) {
  const violations = [
    ...checkUnknownReferences(posts, categories, tags, authors),
    ...checkDuplicateSlugs(posts),
    ...checkDuplicateTranslations(posts),
    ...checkTranslationCategoryCoherence(posts),
    ...checkSiteConfig(siteConfig, fileExists),
  ];

  const summary = {
    posts: posts.length,
    categories: categories.length,
    tags: tags.length,
    authors: authors.length,
  };

  return { violations, summary };
}

/** Renders a human-readable report of a check result. */
export function formatReport({ violations, summary }) {
  if (violations.length === 0) {
    return (
      `Integrity OK — ${summary.posts} posts, ${summary.categories} categories, ` +
      `${summary.tags} tags, ${summary.authors} authors.`
    );
  }
  const lines = violations.map((v) => `  [${v.rule}] ${v.message}`);
  return `Integrity FAILED — ${violations.length} violation(s):\n${lines.join('\n')}`;
}

// --- CLI wrapper -----------------------------------------------------------
// Runs only when the script is invoked directly (never when imported by tests).
// The loader reads the committed content files with the shared raw reader, so
// the check runs as a standalone Node step in CI (before `astro build`). It
// reads the same files Astro reads; it does not depend on Astro's build-only
// virtual modules. See blog/spec.md Decisions Log (2026-07-06).

async function defaultLoadContext() {
  const [{ readFile }, path, { existsSync }, reader] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
    import('node:fs'),
    import('./lib/content-reader.mjs'),
  ]);

  const srcDir = path.resolve(process.cwd(), 'src');
  const contentDir = path.join(srcDir, 'content');
  const publicDir = path.resolve(process.cwd(), 'public');

  const posts = reader.readPosts(path.join(contentDir, 'posts'));
  const categories = reader.readDataCollection(path.join(contentDir, 'categories'));
  const tags = reader.readDataCollection(path.join(contentDir, 'tags'));
  const authors = reader.readDataCollection(path.join(contentDir, 'authors'));

  const siteConfig = JSON.parse(await readFile(path.join(srcDir, 'site.config.json'), 'utf8'));
  const fileExists = (publicPath) =>
    existsSync(path.join(publicDir, publicPath.replace(/^\/+/, '')));

  return { posts, categories, tags, authors, siteConfig, fileExists };
}

async function main(loadContext = defaultLoadContext) {
  const context = await loadContext();
  const result = runIntegrityChecks(context);
  console.log(formatReport(result));
  process.exitCode = result.violations.length > 0 ? 1 : 0;
}

const { pathToFileURL } = await import('node:url');
const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
