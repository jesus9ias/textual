# Blog — Subproject Spec

> This document is the source of truth for Claude Code on `blog/`. It inherits the full contract defined in the monorepo `spec.md` — read both before acting on any prompt. In case of conflict, the monorepo `spec.md` takes precedence unless a deviation is explicitly declared below.

---

## Overview

`blog/` is a statically generated (SSG) personal blog and notes site built with Astro, with SEO and performance as first-class, non-negotiable priorities from the first commit. It has no server-side logic and no database: all content is Markdown + JSON committed to the repository, produced exclusively by `panel/` (see `panel/spec.md`). This subproject covers only `blog/frontend` and `blog/infra`.

URL language prefixing is explicit for every language (see Routing & i18n Resolution) and infra is a single CDK stack deployed entirely in `us-east-1` (see Infrastructure).

---

## Deviations from Monorepo Contract

None.

---

## Content Model

Inherits the canonical Domain Model from the monorepo `spec.md` (Post, Category, Tag, Author, Site config) without modification. This section defines only how `blog/frontend` consumes it.

### Content Collections (`src/content.config.ts`)

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    translationId: z.string(),
    lang: z.enum(['es', 'en']),
    slug: z.string(),
    title: z.string(),
    description: z.string().max(160),
    authorId: z.string(),
    categoryId: z.string(),
    tagIds: z.array(z.string()).default([]),
    coverImage: z.object({
      src: z.string(),
      alt: z.string().min(1),
    }),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    published: z.boolean().default(true),
  }),
});

const categories = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/categories' }),
  schema: z.object({
    es: z.object({ slug: z.string(), title: z.string(), description: z.string() }),
    en: z.object({ slug: z.string(), title: z.string(), description: z.string() }),
  }),
});

const tags = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/tags' }),
  schema: z.object({
    es: z.object({ slug: z.string(), title: z.string() }),
    en: z.object({ slug: z.string(), title: z.string() }),
  }),
});

const authors = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/authors' }),
  schema: z.object({
    es: z.object({ name: z.string(), bio: z.string(), avatar: z.string() }),
    en: z.object({ name: z.string(), bio: z.string(), avatar: z.string() }),
    social: z.object({
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
    }),
  }),
});

export const collections = { posts, categories, tags, authors };
```

Zod validates **shape**. It does not and cannot validate cross-references (`categoryId` pointing at a real category, `translationId` uniqueness per language, etc.) — that is the explicit job of `scripts/validate-integrity.mjs`, run in CI after `astro sync`, never duplicated inside `content.config.ts`.

---

## Routing & i18n Resolution

- Every route lives under an explicit language segment — `src/pages/[lang]/index.astro`, `src/pages/[lang]/[...slug].astro` (posts), `src/pages/[lang]/historico/[page].astro`, `src/pages/[lang]/categoria/[slug]/[page].astro`, `src/pages/[lang]/tag/[slug]/[page].astro`, `src/pages/[lang]/autor/[slug]/[page].astro`. Each uses `getStaticPaths()` scoped to `site.config.json.supportedLangs`, generating `/es/...` and `/en/...` symmetrically — the default language is not special-cased.
- **No page is generated at the bare root `/`.** Astro's build output has no root-level `index.html`; the bare root is handled entirely at the edge by the CloudFront Function described in Infrastructure. This keeps the build itself free of any language-precedence logic.
- The language switcher widget resolves the sibling URL for a post via the `translationId` index (built once per Astro build from `getCollection('posts')`), never by guessing or transforming the current slug.
- A post without a translation in the other language is a valid state, not an error. The two signals are decoupled: the **`hreflang` alternate** for that language is omitted (never advertise a translation that does not exist), but the **visual language switcher** still offers that language, linking to its home — so the toggle is never a dead end. This mirrors the listing pages, which fall back to the language home when a listing has no content in that language.

---

## Layouts by Category

Each post renders through its category's layout when one exists in the active template (`src/templates/{TEMPLATE}/layouts/categories/{categoryId}.astro`), falling back to `src/templates/{TEMPLATE}/layouts/Post.astro` when no category-specific layout is defined. Layout resolution happens at build time from `post.data.categoryId` — there is no runtime/client-side layout switching.

`{TEMPLATE}` (the active template) is selected at **build time** from `PUBLIC_TEMPLATE` in `blog/frontend/.env` (defaulting to `default`), not per-request. Page entry points resolve their layouts and widgets through `src/lib/template.ts`, which globs `src/templates/*` and selects the active template's components by name; components inside a template import each other relatively, so they always stay within their own template. An unknown `PUBLIC_TEMPLATE` fails the build with a clear error.

---

## SEO Deliverables

Mandatory, not deferred to a later stage:

| Deliverable | Route | Notes |
|---|---|---|
| Sitemap | `src/pages/sitemap.xml.ts` (root-level, not under `[lang]`) | Includes every published post's full absolute URL (with its own language prefix) in every language, plus aggregator pages. Each `<url>` carries `xhtml:link rel="alternate"` annotations cross-referencing its equivalents in the other languages (plus `x-default`), for both posts (linked by `translationId`) and aggregators (same entity, localized slug, same page number). Single-language URLs carry no alternates. Lives at the true root path, unaffected by the root-redirect rule since that rule matches only the exact `/` path |
| Robots | `src/pages/robots.txt.ts` (root-level) | Points to the sitemap; generated, not a static file, so it can reference `PUBLIC_SITE_URL` from `.env` |
| RSS/Atom | `src/pages/[lang]/rss.xml.ts` | One feed per language — `/es/rss.xml`, `/en/rss.xml` — symmetric, no default-language special case |
| `hreflang` alternates | every post page `<head>` | Built from the `translationId` index; includes `x-default` pointing at the absolute URL of the `/{defaultLang}/` version |
| `og:image` / Twitter card | every post page `<head>` | Sourced from `post.data.coverImage`, falling back to `site.config.json.defaultCoverImage` only for aggregator/listing pages, never silently for a post itself (a post without a valid cover fails `astro sync`'s schema check) |
| Meta title/description | every page | `post.data.title` / `post.data.description`; aggregator pages use the localized `title`/`description` from their category/tag/author entity |

---

## Infrastructure

### Bucket

One private S3 bucket holds the entire built site — post pages, home, listings, `sitemap.xml`/`rss.xml`/`robots.txt`, and shared assets. TTL differentiation (immutable hashed assets vs. short-lived HTML) is applied at publish time via per-object `Cache-Control` headers, which CloudFront's CachingOptimized policy honors — so no bucket split is needed. (This supersedes the earlier two-bucket `entries`/`shell` design; see Decisions Log.)

### CloudFront

One distribution with a single behavior over one origin (the site bucket), fronted by one Origin Access Control (OAC) — see Security Contract in the monorepo spec.

A single **CloudFront Function** on the behavior's viewer-request event does two things: (1) it matches the exact request URI `/` and returns a `301` to `/{defaultLang}/` (`{defaultLang}` interpolated at CDK synth time from `DEFAULT_LANG`, never read at runtime); and (2) it rewrites directory-style URIs to append `index.html` (e.g. `/es/` → `/es/index.html`, `/en/how-black-holes-form` → `/en/how-black-holes-form/index.html`) so clean URLs resolve against the S3 REST origin. URIs with a file extension (`/sitemap.xml`, `/es/rss.xml`, `/_astro/*`) pass through unchanged.

### DNS / Certificate

Single stack (`textual-stack.ts`). The hosted zone is referenced, never created; the ACM certificate is referenced or requested within the same stack. The entire stack is deployed in `us-east-1`, since CloudFront requires the certificate there and none of the stack's other resources are region-sensitive — this avoids any cross-region reference.

### Deploy

`blog/infra` is deployed exclusively from local via `cdk deploy`, per the monorepo CI/CD Contract. It is never invoked by GitHub Actions.

### Multiple stacks

The whole stack is named from `STACK_NAME` in `blog/infra/.env`. That name is both the CloudFormation stack name and the prefix of every auto-generated physical resource name (the bucket, etc. — none of which is hardcoded). So the same project can be deployed as several independent stacks — one `.env` per subdomain (or per fork, e.g. when running different templates) — each with its own domain, certificate, bucket, distribution, and DNS records, and each tagged `Project=<STACK_NAME>`. Different stacks must use different subdomains; nothing is shared between them.

---

## CI/CD Pipeline — `deploy-blog.yml`

Full step list is defined in the monorepo `spec.md` CI/CD Contract. This section defines the two custom scripts that pipeline depends on.

### `scripts/validate-integrity.mjs`

Runs after `astro sync`, using `getCollection()` against the already-typed, already-parsed collections — it does not re-parse Markdown or JSON itself.

Checks performed (see Unit Test Definitions below for the corresponding test IDs):

1. Every `post.categoryId` exists in the `categories` collection
2. Every `post.authorId` exists in the `authors` collection
3. Every `post.tagIds[]` entry exists in the `tags` collection
4. `post.slug` is unique within its `lang`
5. At most one post per `translationId` per `lang`
6. Translations sharing a `translationId` share the same `categoryId` (mismatch → hard error in CI)
7. `site.config.json.defaultLang` is a member of `supportedLangs`
8. `site.config.json.defaultCoverImage` resolves to an existing file under `public/`

Exits non-zero with a readable list of every violation found (not just the first one) if any check fails; `astro build` never runs when this script fails.

### `scripts/compute-invalidation-paths.mjs`

Determines the exact set of CloudFront paths to invalidate for a given publish, sourced from a
manifest the panel maintains directly — not from diffing git history.

Approach:

1. The panel (`panel/spec.md`) appends one CloudFront path per line to `invalidation-manifest.txt`
   (repo root, outside `blog/`) on every post/category/tag/author create/edit/delete, using its own
   copy of the shell/entry path-building logic. Lines starting with `---` are **cut markers**
   (`---YYYY/MM/DD`, appended manually from the panel after the developer confirms a prior publish
   succeeded) — everything else is a literal invalidation path.
2. This script reads the manifest, takes every path line **after the last cut marker** (the whole
   file if no cut marker exists yet), and de-duplicates it.
3. It unions that set with the always-invalidate paths — every supported language's home page plus
   `sitemap.xml` and `robots.txt` — built from `routing.mjs`'s `alwaysInvalidatePaths(supportedLangs)`,
   since these routes are affected by changes the panel does not track (template/layout/page edits)
   and are cheap enough to invalidate unconditionally on every publish.
4. Output: one flat, deduplicated path list consumed directly by the invalidation step (no more
   separate entries/shell lists — the panel already emits ready-to-use paths, exact or wildcard).

The workflow only ever *reads* the manifest; it never writes to it (no cut marker, no cleanup) —
publish cuts are exclusively a manual action from the panel, so the developer's local clone never
needs to pull a CI-authored commit before the next push. (Supersedes the git-diff-based
`detect-changed-views.mjs` — see Decisions Log.)

---

## Gherkin Feature Specifications

> All scenarios must be defined here before Stage 2 begins. No scenario is added or modified after Stage 2 without developer authorization.

### Feature: Root URL redirect

```gherkin
Feature: Root URL redirects to the default language

  Scenario: Visiting the bare domain redirects to the default language home
    Given the site is deployed with DEFAULT_LANG "es"
    When a visitor requests "/"
    Then CloudFront responds with a 301 redirect to "/es/"

  Scenario: Redirect target always matches the configured default language
    Given DEFAULT_LANG is "es" at deploy time
    When any visitor or crawler requests "/", regardless of its Accept-Language header
    Then the redirect target is "/es/" and never varies

  Scenario: Deep links and root-level static files are unaffected
    Given a visitor requests "/es/como-se-forman-los-agujeros-negros"
    Or requests "/sitemap.xml"
    Or requests "/robots.txt"
    Then no redirect is applied
    And the requested resource is served normally
```

### Feature: Content integrity validation

```gherkin
Feature: CI integrity validation blocks bad builds

  Scenario: Post references a non-existent category
    Given a post with categoryId "nonexistent"
    When validate-integrity.mjs runs
    Then it exits with a non-zero status
    And the reported error names the offending post and categoryId
    And astro build does not run

  Scenario: Duplicate slug within the same language
    Given two posts with lang "es" and the same slug
    When validate-integrity.mjs runs
    Then it exits with a non-zero status
    And the reported error names both post ids and the duplicated slug

  Scenario: Two posts share a translationId in the same language
    Given two posts with the same translationId and lang "en"
    When validate-integrity.mjs runs
    Then it exits with a non-zero status

  Scenario: Translations of the same piece have mismatched categories
    Given a post pair sharing a translationId
    And one has categoryId "fisica" and the other "economia"
    When validate-integrity.mjs runs
    Then it exits with a non-zero status
    And the reported error names both post ids and both categoryIds

  Scenario: All references valid
    Given every post's categoryId, authorId, and tagIds resolve to existing entities
    And no slug or translationId collisions exist
    And defaultLang is included in supportedLangs
    And defaultCoverImage resolves to an existing file
    When validate-integrity.mjs runs
    Then it exits with a zero status
    And astro build proceeds
```

### Feature: i18n resolution and hreflang

```gherkin
Feature: Cross-language linking

  Scenario: Post with a translation shows the language switcher target
    Given a post with translationId "black-holes-formation" in "es"
    And a post with the same translationId in "en"
    When the "es" post page is built
    Then its <head> includes an hreflang="en" alternate pointing to the "en" post's URL
    And it includes an hreflang="x-default" alternate

  Scenario: Post without a translation omits the switcher target
    Given a post with translationId "solo-post" in "es" only
    When the "es" post page is built
    Then no hreflang="en" alternate is rendered for it

  Scenario: Category listing pages exist per language with localized metadata
    Given a category "fisica" with es.title "Física" and en.title "Physics"
    When the category listing pages are built
    Then the "es" listing page title is "Física"
    And the "en" listing page title is "Physics"
    And both list only posts whose categoryId is "fisica", filtered by their own lang
```

### Feature: SEO deliverables

```gherkin
Feature: Sitemap, robots, and RSS generation

  Scenario: Sitemap includes every published post in every language
    Given 3 published "es" posts and 2 published "en" posts
    When sitemap.xml is built
    Then it contains 5 post URLs plus the aggregator page URLs

  Scenario: Unpublished posts are excluded from all SEO surfaces
    Given a post with published: false
    When sitemap.xml, rss.xml, and the relevant listing pages are built
    Then the unpublished post does not appear in any of them

  Scenario: Post missing a cover image alt fails validation before reaching SEO output
    Given a post whose coverImage.alt is an empty string
    When astro sync runs
    Then the Zod schema check fails
    And no page is generated for that post
```

### Feature: Cover image and layout resolution

```gherkin
Feature: Category-specific layouts and cover images

  Scenario: Post renders with its category's custom layout
    Given the active template defines layouts/categories/fisica.astro
    And a post has categoryId "fisica"
    When the post page is built
    Then it renders using layouts/categories/fisica.astro

  Scenario: Post falls back to the default post layout
    Given the active template does not define a layout for categoryId "economia"
    And a post has categoryId "economia"
    When the post page is built
    Then it renders using layouts/Post.astro

  Scenario: Cover image renders through Astro's Image component
    Given a post with a valid coverImage
    When the post page is built
    Then the rendered <img> is produced by Astro's Image component
    And includes responsive/optimized output (not a raw unprocessed reference)
```

### Feature: Incremental publish pipeline

```gherkin
Feature: Manifest-driven invalidation limits scope to what changed since the last publish

  Scenario: Only paths added since the last cut are invalidated
    Given the manifest contains paths A and B, then a cut marker, then paths C and D
    When compute-invalidation-paths.mjs runs
    Then the invalidation list contains C and D
    And it does not contain A or B

  Scenario: No cut marker yet treats the whole manifest as pending
    Given the manifest contains paths A and B with no cut marker
    When compute-invalidation-paths.mjs runs
    Then the invalidation list contains A and B

  Scenario: Duplicate paths collapse to one entry
    Given the manifest contains path A twice after the last cut marker
    When compute-invalidation-paths.mjs runs
    Then the invalidation list contains A exactly once

  Scenario: Always-invalidate paths are included even with an empty pending batch
    Given the manifest has no lines after the last cut marker
    When compute-invalidation-paths.mjs runs
    Then the invalidation list still contains every supported language's home page,
      sitemap.xml, and robots.txt

  Scenario: Only the most recent cut marker matters
    Given the manifest contains a cut marker, path A, another cut marker, then path B
    When compute-invalidation-paths.mjs runs
    Then the invalidation list contains B
    And it does not contain A
```

---

## Unit Test Definitions

> Definitions live here before implementation. No test is written without a definition here; no definition is added or modified after Stage 2 without developer authorization.

### `validate-integrity.mjs`

| Test ID | Objective | Input | Expected output |
|---|---|---|---|
| `T-VAL-01` | Flags a post with a non-existent categoryId | post.categoryId not in categories collection | Error entry naming post + categoryId; exit code 1 |
| `T-VAL-02` | Flags a post with a non-existent authorId | post.authorId not in authors collection | Error entry; exit code 1 |
| `T-VAL-03` | Flags a post with a non-existent tagId | one entry in tagIds not in tags collection | Error entry; exit code 1 |
| `T-VAL-04` | Flags duplicate slugs within the same lang | two "es" posts, same slug | Error entry naming both posts; exit code 1 |
| `T-VAL-05` | Allows the same slug across different langs | "es" and "en" post share a slug string | No error for this pair |
| `T-VAL-06` | Flags duplicate translationId within the same lang | two "en" posts, same translationId | Error entry; exit code 1 |
| `T-VAL-07` | Allows one translationId across two different langs | one "es" and one "en" post share a translationId | No error for this pair |
| `T-VAL-08` | Flags category mismatch between linked translations | shared translationId, different categoryId | Error entry naming both posts and categories; exit code 1 |
| `T-VAL-09` | Flags defaultLang missing from supportedLangs | site.config.json inconsistency | Error entry; exit code 1 |
| `T-VAL-10` | Flags a missing defaultCoverImage file | path does not resolve under public/ | Error entry; exit code 1 |
| `T-VAL-11` | Exits 0 and prints a summary when everything is valid | fully consistent fixture set | Exit code 0; summary line with entity counts |
| `T-VAL-12` | Reports every violation found, not just the first | fixture with 3 independent violations | 3 error entries in output |

### `compute-invalidation-paths.mjs`

| Test ID | Objective | Input | Expected output |
|---|---|---|---|
| `T-INV-01` | Only lines after the last cut marker are included | manifest with paths before and after a cut marker | output contains only post-cut paths |
| `T-INV-02` | No cut marker present treats the entire file as pending | manifest with paths, no cut marker line | output contains every path in the file |
| `T-INV-03` | Duplicate paths collapse to a single entry | same path repeated 3 times after the last cut | output contains that path once |
| `T-INV-04` | Always-invalidate paths are included even when nothing is pending | manifest with no lines after the last cut marker | output contains exactly the always-invalidate set |
| `T-INV-05` | Cut marker lines never appear in the output | manifest with one or more `---YYYY/MM/DD` lines | output contains no line matching the cut-marker pattern |
| `T-INV-06` | Only the most recent cut marker is honored | manifest with two cut markers and paths interleaved | output contains only paths after the last marker |

### Astro hreflang builder (pure function, testable outside Astro's build)

| Test ID | Objective | Input | Expected output |
|---|---|---|---|
| `T-I18N-01` | Builds alternate links for a fully-translated pair | posts sharing translationId in "es" and "en" | Two alternate entries + one x-default entry |
| `T-I18N-02` | Returns no alternates for an untranslated post | post with a unique translationId | Empty alternates array |
| `T-I18N-03` | x-default always points at the defaultLang version | translated pair with defaultLang "es" | x-default href equals the "es" post's URL |

### Root-redirect CloudFront Function

| Test ID | Objective | Input | Expected output |
|---|---|---|---|
| `T-REDIR-01` | Redirects the exact root path | request URI `/`, DEFAULT_LANG "es" | 301 response, `Location: /es/` |
| `T-REDIR-02` | Does not redirect a prefixed path | request URI `/es/mi-post` | request passed through unmodified |
| `T-REDIR-03` | Does not redirect root-level static files | request URI `/sitemap.xml` or `/robots.txt` | request passed through unmodified |
| `T-REDIR-04` | Redirect target follows DEFAULT_LANG at build time, not any request header | function built with DEFAULT_LANG "en"; request carries `Accept-Language: es` | 301 response, `Location: /en/` |

---

## Implementation Stages

Stages are executed in strict order. Claude Code stops after each stage and waits for developer authorization to proceed.

### Delivery status

| Stage | Status | Notes |
|---|---|---|
| 1 — Infra | Code complete; `tsc` + `cdk synth` pass | Live `cdk deploy` + manual `/`→`/{DEFAULT_LANG}/` check are the developer's, from local |
| 2 — Content Collections & integrity | Done | `T-VAL-01…12` green |
| 3 — Templates, layouts, widgets, pages, SEO | Done | Build passes (19 pages); `T-I18N-01…03` green; Gherkin verified against `dist/` |
| 4 — CI/CD pipeline | Code complete; `T-DIFF-01…06` green | git wrapper's live check is the developer's first test push (this repo was not yet a git repo at authoring time) |
| 5 — Documentation | Done | `blog/claude.md`, `blog/readme.md`, finalized Decisions Log |

Resolved (2026-07-07): the provisional `entries`/`shell` CloudFront partition — which could not be expressed cleanly for real serving — was removed by consolidating to a single bucket + one behavior, with an edge directory-index rewrite. See the Decisions Log.

Resolved (2026-07-10): the git-diff-based `detect-changed-views.mjs` (Stage 4) — which could not see changes outside `src/content` (templates, layouts, pages), silently skipping their invalidation — was replaced by a panel-authored manifest with a manual publish-cut marker; the CI script is now `compute-invalidation-paths.mjs`. See the Decisions Log.

---

### Stage 1 — Infra

**Scope:** Deploy the blog's AWS infrastructure as a single CDK stack. No frontend code.

**Deliverables:**
- `infra/bin/textual.ts` and `infra/lib/textual-stack.ts` — single stack, `env.region` fixed to `us-east-1`
- `infra/lib/constructs/static-site.ts` — two S3 buckets, two OACs, one CloudFront distribution with two behaviors
- `infra/lib/constructs/root-redirect-function.ts` — CloudFront Function, exact-match `/` → 301 `/{DEFAULT_LANG}/`, value interpolated at synth time
- `infra/.env.example` with all required variables, including `DEFAULT_LANG`
- `infra/readme.md` with deploy instructions

**Validation:** `tsc --noEmit` passes. Developer runs `cdk deploy` from local and confirms both buckets, both OACs, the CloudFront distribution, and the root-redirect function all work — including a manual check that `/` redirects to `/{DEFAULT_LANG}/`.

---

### Stage 2 — Content Collections and integrity validation

**Scope:** Define `content.config.ts`, write `validate-integrity.mjs` with fixture-based tests per `T-VAL-*`, no page/template implementation yet.

**Deliverables:**
- `src/content.config.ts` as defined in this spec
- `src/site.config.json` (with placeholder `siteUrl`, real value from `.env` at build)
- `scripts/validate-integrity.mjs`
- Fixture content set (a handful of posts/categories/tags/authors, including at least one intentionally-broken fixture set per `T-VAL-*` case) used to test the script
- `scripts/__tests__/validate-integrity.test.mjs` covering every `T-VAL-*` id

**Constraints:** No `pages/`, `templates/`, or `layouts/` implementation in this stage. Running the validation test suite against the fixtures must produce the exact pass/fail matrix defined in the `T-VAL-*` table.

---

### Stage 3 — Templates, layouts, widgets, pages

**Scope:** Full site implementation — default template, layouts (including category-specific), widgets, all page routes, SEO surfaces.

**Order within this stage:**
1. `templates/default/layouts/Base.astro`, `Post.astro`
2. Widgets: Menu, PostList, Paginator, Tags, Categories, Authors
3. `pages/[lang]/[...slug].astro` — post resolution, scoped per language, no default-language special case
4. `pages/[lang]/index.astro`, `historico/[page].astro`, `categoria/[slug]/[page].astro`, `tag/[slug]/[page].astro`, `autor/[slug]/[page].astro`
5. `pages/sitemap.xml.ts`, `pages/robots.txt.ts` (root-level), `pages/[lang]/rss.xml.ts`
6. hreflang alternate builder (with `T-I18N-*` tests) wired into post pages
7. Category-specific layout resolution + fallback
8. Cover image rendering via Astro `<Image>`, including the `defaultCoverImage` fallback path for listings

**After each sub-step, verify the corresponding Gherkin scenario(s) manually or via test where applicable.**

---

### Stage 4 — CI/CD pipeline

**Scope:** `scripts/detect-changed-views.mjs` with `T-DIFF-*` tests, and `.github/workflows/deploy-blog.yml`.

**Deliverables:**
- `scripts/detect-changed-views.mjs`, with its diffing mechanism decided and documented in the Decisions Log below before implementation
- `scripts/__tests__/detect-changed-views.test.mjs` covering every `T-DIFF-*` id
- `.github/workflows/deploy-blog.yml` implementing the full step sequence from the monorepo CI/CD Contract, with bucket names / distribution ID sourced from GitHub Actions secrets

**Validation:** A test push with a single new post triggers exactly the expected entries/shell path sets, verified against `T-DIFF-*` expectations before the workflow is considered done.

---

### Stage 5 — Documentation

**Scope:** Complete all documentation. No code changes.

**Deliverables:**
- `blog/spec.md` — finalize decisions log
- `blog/claude.md` — blog-specific Claude Code instructions
- `blog/readme.md` — local dev, content authoring (for manual edits), and deploy instructions

---

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-03 | SSG via Astro Content Collections, Option A (frontmatter as sole post metadata source) | Established in the monorepo spec; restated here as the binding contract for `content.config.ts` |
| 2026-07-03 | `validate-integrity.mjs` consumes `getCollection()` after `astro sync` rather than parsing files itself | Reuses Astro's typed, already-validated collection output; avoids a second Markdown/JSON parser |
| 2026-07-03 | Category-coherence mismatch between linked translations is a hard CI error, not just a panel-side warning | CI is the last line of defense against a manually-edited file bypassing the panel's softer warning |
| 2026-07-03 | `detect-changed-views.mjs`'s exact diffing mechanism is deferred to Stage 4 implementation, not fixed at spec time | The mechanism (git-diff based vs. manifest-comparison based) has trade-offs best evaluated against a real build, not speculated upfront; the script's *contract* (inputs/outputs per `T-DIFF-*`) is fixed now, its internals are not |
| 2026-07-06 | (Stage 4) `detect-changed-views.mjs`'s diffing mechanism is **git-based**: `git diff --name-status <base> <head>` for the change set, `git show <base>:<path>` to read the prior version of modified/removed files | A removed or modified post's *former* aggregators (its previous category/tags/author listings) can only be computed from its previous content, which git already holds keyed by the last deployed commit. A build-time manifest could not recover a deleted file's metadata without separately persisting it. The pure path-computation core is split from the git wrapper so it is unit-testable against fixtures (per `T-DIFF-*`) with no git |
| 2026-07-06 | (Stage 4) Paginated aggregator invalidations use a path wildcard (e.g. `/es/categoria/fisica/*`) rather than a single page path | Adding/removing a post shifts which posts land on every page of an aggregator, so the whole paginated set must be invalidated; home, sitemap, RSS and the post entry itself are single exact paths |
| 2026-07-06 | (Stage 4) `validate-integrity.mjs`'s CI loader reads the committed files via the shared raw reader (`scripts/lib/content-reader.mjs`), finalizing the Stage-2 open item | `astro:content` is not importable from standalone Node; the gate reads the same files Astro reads. One raw reader is shared with `detect-changed-views.mjs`, so there is a single parser. The tested pure checks are unchanged. This finalizes the "CI invocation deferred to Stage 4" note |
| 2026-07-06 | (Stage 4) The S3 sync splits post pages (`{lang}/{slug}/`) to the `entries` bucket and everything else to `shell`, listed by `scripts/list-entry-paths.mjs`; scoped invalidation is fed by `detect-changed-views.mjs` | Matches the two-bucket TTL split. **(Superseded 2026-07-07 — single bucket: the workflow now does one `aws s3 sync` with per-object `Cache-Control`; `list-entry-paths.mjs` was removed. `detect-changed-views.mjs` still feeds scoped invalidation, its two path lists both targeting the one distribution.)** |
| 2026-07-06 | (post-Stage 3) The sitemap cross-references language alternates per `<url>` via `xhtml:link` (Google's recommended multilingual sitemap method), for posts and aggregators, in addition to the `<head>` hreflang | Centralizes the alternate map so crawlers get it without re-reading every page head; more robust at scale. Both methods are kept and stay consistent because both derive from the same `translationId` / entity+lang source. Aggregator alternates match same-page-number equivalents; URLs that exist in only one language carry no alternates (mirrors `buildHreflangAlternates` returning none for untranslated posts) |
| 2026-07-06 | (post-Stage 3) The visual language switcher is decoupled from `hreflang`: an untranslated post still shows the other language in the toggle, linking to that language's home, while the `hreflang` alternate stays omitted | The switcher is a navigation affordance, not an SEO signal — omitting it left a solo-language post with no way to change language, inconsistent with the listing pages' home fallback. SEO correctness is preserved because `hreflang`/sitemap alternates remain strictly omitted for non-existent translations |
| 2026-07-07 | (post-Stage 3) The active template is selected at build time from `PUBLIC_TEMPLATE` in `blog/frontend/.env`; page entry points resolve components via `src/lib/template.ts` (`import.meta.glob` over `src/templates/*`) | Fills the spec's `{TEMPLATE}` placeholder with a concrete, env-driven mechanism (not per-request, not hardcoded to `default`). Astro needs literal glob patterns, so all templates are globbed and the active one is picked by name; intra-template relative imports keep each template self-contained. Sourced from `.env` per the developer's preference; an unknown value fails the build |
| 2026-07-07 | (post-Stage 1) The stack name comes from `STACK_NAME` in `blog/infra/.env` (used as the CDK stack id + CloudFormation `stackName`); resources keep auto-generated names and are tagged `Project=<STACK_NAME>` | Lets the same project deploy as multiple independent stacks (one per subdomain / fork) without code changes. Auto-generated names already embed the stack name as their prefix, so they stay unique per stack without risking the global-uniqueness collisions explicit bucket names would cause; the `Project` tag groups a stack's resources in the console/billing |
| 2026-07-07 | (post-Stage 3) Added a second template, `noir` (`src/templates/noir/`), a self-contained dark reskin copying every `default` layout/widget (per the template contract: intra-template relative imports only). Its `Base.astro` reflows the home page's existing `<aside class="taxonomies">` (Categories/Tags/Authors) into a right-hand column purely via CSS Grid (`main:has(> .taxonomies)`), with no changes to `pages/[lang]/index.astro` or any other page | Proves the env-driven template mechanism with a real second template rather than just `default`. The sidebar reflow is CSS-only so it stays isolated to `noir` and cannot affect `default`'s single-column layout or any other page (posts/listings never render that aside) |
| 2026-07-07 | Every template's `Base.astro` puts `data-template="<name>"` on its own `<html>` and namespaces all of that component's `is:global` selectors (`:root`, `body`, `main`, `a`, `img`, `footer`) under `html[data-template="<name>"]`; `noir/widgets/Categories.astro`'s cross-widget `.taxonomies .taxonomy` rule is namespaced the same way | `src/lib/template.ts` globs every template eagerly, so with two-plus templates present, every template's unscoped global CSS was landing on every page regardless of the active one — same-specificity rules from whichever template sorted last in the glob were silently winning the cascade (`noir`'s dark colors bled onto `default`-rendered pages). Namespacing under the active template's own `data-template` attribute isolates each template's globals even though all of them are always imported |
| 2026-07-07 | `PUBLIC_TEMPLATE` is added to `deploy-blog.yml`'s job `env:`, sourced from a GitHub Actions secret, alongside `PUBLIC_SITE_URL` | `.env`/`.env.production` are git-ignored, so the active template chosen locally never reached the CI build; without this, every deploy silently published `default` regardless of the developer's local `.env` |
| 2026-07-03 | robots.txt and rss.xml are generated `.ts` routes, not static files | Both need `PUBLIC_SITE_URL` from `.env` at build time; a static file would require manual editing per environment |
| 2026-07-06 | All routes, including the default language, live under `pages/[lang]/...`; no root-level `index.html` is generated by Astro | Symmetric routing with no default-language special case; the bare root is entirely the CloudFront Function's responsibility, keeping build-time routing logic simpler |
| 2026-07-06 | The root-redirect CloudFront Function matches only the exact URI `/`, and its target language is interpolated at CDK synth time from `DEFAULT_LANG`, not resolved from any per-request signal | Guarantees `sitemap.xml`, `robots.txt`, and every prefixed content path are unaffected; a fixed synth-time target keeps the redirect identical for every visitor and every crawler, avoiding the SEO risks of content-based redirects |
| 2026-07-06 | `sitemap.xml` and `robots.txt` remain at the true root path (outside `[lang]`), while `rss.xml` moves under `[lang]` | A sitemap is a single canonical entry point covering every language's absolute URLs, so it has no language of its own; an RSS feed is inherently single-language content, so one feed per language is correct |
| 2026-07-06 | Single CDK stack (`textual-stack.ts`), deployed entirely in `us-east-1` | Resolves the monorepo's Open Decision #2; none of the stack's resources besides the CloudFront-facing ACM certificate are region-sensitive, so a single region avoids cross-region references without needing a stack split |
| 2026-07-06 | (Stage 1) The `shell` origin is CloudFront's **default** behavior and `entries` is the **additional** behavior — not the reverse | The root-redirect function must sit on the behavior that serves the exact `/` URI; that is the default behavior. Making `shell` the default lets the function intercept `/` while `entries` is reached via an explicit path pattern. **(Superseded 2026-07-07 — single bucket + single behavior.)** |
| 2026-07-06 | (Stage 1) The `entries` behavior's path pattern is provisional (`/{DEFAULT_LANG}/*`), finalized in Stage 3 | The exact entries/shell partition depends on the site's route shapes and `supportedLangs`, which do not exist until Stage 3. **(Superseded 2026-07-07 — the partition proved unexpressible for clean SEO URLs; consolidated to a single bucket.)** |
| 2026-07-07 | Consolidated the two buckets into one, with per-object `Cache-Control` for TTL and an edge CloudFront Function that root-redirects **and** rewrites directory URIs to `index.html` | Post-deploy, `/es/` and `/en/…` returned AccessDenied: (a) an S3 REST origin does not append `index.html`, and (b) the provisional `/{DEFAULT_LANG}/*` behavior mis-routed home/listings/other-language posts to the wrong bucket. Clean SEO URLs cannot be partitioned by CloudFront path patterns without per-language behavior enumeration; a single bucket removes the problem, and `Cache-Control` preserves the TTL intent |
| 2026-07-06 | (Stage 1) Both S3 buckets use auto-generated names and `RemovalPolicy.RETAIN`; names are exposed as stack outputs | Bucket names are globally unique and environment-specific and must not be hardcoded in a public repo; RETAIN protects published output on stack teardown since the source of truth is the git repository. Outputs feed the GitHub Actions secrets consumed by the content pipeline |
| 2026-07-06 | (Stage 2) `validate-integrity.mjs` splits a pure `runIntegrityChecks(collections)` function from a thin CLI wrapper that feeds it `getCollection()` output | Keeps the CI decision (consume Astro's typed collections, no second parser) intact while making the `T-VAL-*` matrix unit-testable against fixtures without booting Astro. `fileExists` is injected so the default-cover check needs no real filesystem in tests |
| 2026-07-06 | (Stage 2) Tests run on Node's built-in test runner (`node:test`), fixtures are collection-shaped JS objects (`{ id, data }`), not re-parsed content files | Zero test dependencies; fixtures match `getCollection()`'s exact output shape, so the validator is exercised on the same structure it sees in CI without reintroducing a Markdown/JSON parser the Decisions Log forbids |
| 2026-07-06 | (Stage 2) The exact CI invocation of `validate-integrity.mjs` (how Astro collections reach the script in the pipeline) is finalized with the workflow in Stage 4 | `astro:content` is a build-only virtual module; the concrete run mechanism is best pinned against the real workflow, mirroring how `detect-changed-views.mjs`'s diffing mechanism is deferred to Stage 4. Stage 2's deliverable is the tested check logic and schema |
| 2026-07-06 | (Stage 3) Collections use Astro 5's Content Layer `glob()` loader instead of the legacy `type: 'content'` / `type: 'data'` | `slug` is a reserved field in classic content collections (Astro strips it from `data`), which broke the spec's `slug: z.string()` post schema at `astro sync`. The `glob` loader (the idiomatic form in "Astro latest") makes `slug` a normal field, preserving the canonical Domain Model and the exact Zod schema; only the collection *definition* mechanism changed |
| 2026-07-10 | `detect-changed-views.mjs`'s git-diff mechanism is retired; invalidation paths are now sourced from a manifest the panel writes directly at write time (`panel/spec.md`) | The git-diff wrapper could only see `src/content`/`site.config.json` changes, so template/layout/page edits produced zero invalidation paths — silently relying on the HTML's short TTL to self-heal. The panel already knows the exact paths a change affects the moment it happens, without needing `git show` to recover a deleted file's prior metadata |
| 2026-07-10 | The manifest (`invalidation-manifest.txt`, repo root, outside `blog/`) uses a plain-text, append-only format: literal CloudFront paths, one per line, plus manually-inserted cut-marker lines (`---YYYY/MM/DD`) that delimit "already published" from "pending" | Keeping the manifest outside `blog/` means editing it (including inserting a cut marker or manually trimming old entries) never matches the `blog/frontend/**` path filter and so never re-triggers `deploy-blog.yml`. A leading `---` is reserved for markers because no CloudFront path can start with those characters, so parsing is unambiguous |
| 2026-07-10 | The publish cut is a **manual** action (a button in the panel that appends the cut-marker line), not something CI writes back after a successful deploy | Alternatives considered: CI committing the cut marker back to `main` (rejected — needs bot identity/write permissions and forces a `git pull` before the developer's next local push); external state in GitHub Actions cache or a dedicated S3 object (rejected — extra infrastructure/reliability surface, e.g. cache eviction or public exposure risk via the CDN, for no benefit over a manual click). The manual button's only failure mode — forgetting to click it — over-invalidates on the next publish, never under-invalidates, which was already the accepted worst case for manual manifest edits |
| 2026-07-10 | `routing.mjs` gains `alwaysInvalidatePaths(supportedLangs)`: every language's home page plus `sitemap.xml`/`robots.txt`, unioned into every publish's invalidation list regardless of the manifest's content | These are the only routes affected by changes the panel cannot see (template/layout/page edits made directly in code); today that's a fixed, cheap set (4 paths), so unconditionally invalidating them removes the need for any git-diff-based "did non-content change" check. Documented rule: any future root-level or non-panel-tracked view must be added here immediately |
| 2026-07-10 | `compute-invalidation-paths.mjs` replaces `detect-changed-views.mjs`; its git-based wrapper and `T-DIFF-01…06` are retired in favor of a pure manifest-parsing core (`T-INV-01…06`) | The script's job changes from reconstructing routes via `git diff`/`git show` to parsing an already-computed manifest — no git plumbing left to test, so the old git-wrapper tests no longer apply |