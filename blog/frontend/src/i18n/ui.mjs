/**
 * The i18n layer — the ONLY place user-visible UI text lives (per the monorepo
 * working discipline). Templates and widgets never inline user-facing strings;
 * they call `t(lang, key)`. Content strings (post titles, category names, etc.)
 * come from the content collections, not from here.
 */
import siteConfig from '../site.config.json' with { type: 'json' };

const STRINGS = Object.freeze({
  es: {
    siteTitle: 'Textual',
    siteTagline: 'Notas y ensayos',
    navHome: 'Inicio',
    navArchive: 'Histórico',
    sectionCategories: 'Categorías',
    sectionTags: 'Etiquetas',
    sectionAuthors: 'Autores',
    byAuthor: 'por',
    readMore: 'Leer más',
    prevPage: 'Anteriores',
    nextPage: 'Siguientes',
    pageOf: 'Página {current} de {total}',
    postsInCategory: 'Artículos en {name}',
    postsWithTag: 'Artículos con la etiqueta {name}',
    postsByAuthor: 'Artículos de {name}',
    noPosts: 'No hay artículos todavía.',
    rssTitle: 'Textual — RSS',
  },
  en: {
    siteTitle: 'Textual',
    siteTagline: 'Notes and essays',
    navHome: 'Home',
    navArchive: 'Archive',
    sectionCategories: 'Categories',
    sectionTags: 'Tags',
    sectionAuthors: 'Authors',
    byAuthor: 'by',
    readMore: 'Read more',
    prevPage: 'Newer',
    nextPage: 'Older',
    pageOf: 'Page {current} of {total}',
    postsInCategory: 'Posts in {name}',
    postsWithTag: 'Posts tagged {name}',
    postsByAuthor: 'Posts by {name}',
    noPosts: 'No posts yet.',
    rssTitle: 'Textual — RSS',
  },
});

/**
 * Translates a key for a language, falling back to the default language.
 * `vars` interpolates `{placeholder}` tokens.
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(lang, key, vars = {}) {
  const table = STRINGS[lang] ?? STRINGS[siteConfig.defaultLang];
  let value = table[key] ?? key;
  for (const [name, replacement] of Object.entries(vars)) {
    value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
  }
  return value;
}
