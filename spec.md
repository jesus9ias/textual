# Textual — Monorepo Spec

> This document is the source of truth for the Textual monorepo. It defines the contract shared by `blog/` and `panel/`, the canonical content/domain model, and the working discipline for Claude Code. Read it fully — together with `blog/spec.md` and `panel/spec.md` — before acting on any prompt. In case of conflict between this document and a subproject spec, this document takes precedence unless a deviation is explicitly declared in the subproject's own Deviations section.

---

## Working Style for Claude Code

- **Spec-first:** Every feature implemented must trace back to a Gherkin scenario defined in this document or in the applicable subproject `spec.md`. No feature is implemented speculatively.
- **Stage discipline:** Implementation is divided into ordered stages, defined per subproject. Begin with Stage 1. Do not proceed to the next stage without explicit developer authorization.
- **TDD gate:** Tests (or, for the blog's content pipeline, validation scripts) are written before implementation. No code is added that does not pass its corresponding test. Tests are never created or modified without developer authorization.
- **Review-first:** When asked to review, audit, inspect, or analyze code or documentation, report findings only. Do not apply changes until the developer explicitly confirms.
- **Conflict detection:** If a proposed change contradicts existing documentation or a prior decision, stop, alert the developer, and wait for confirmation. If confirmed, update the documentation first, then apply the change.
- **No magic values:** All constants, enums, and config keys are declared in dedicated files (`constants/`, `.env`, or `*.config.json`). No inline literal values anywhere.
- **Language:** All code, comments, identifiers, and documentation (`spec.md`, `claude.md`, `readme.md`) are written in English. User-visible text lives only in the relevant i18n/config layer (see each subproject spec).
- **Sensitive / environment-specific data:** Domain names, AWS account ID, hosted zone ID, certificate ARN, and any other environment-specific values live in `.env` files only, never hardcoded. Verify on every edit.
- **Scope discipline:** Code unrelated to the current task is never modified without developer authorization.
- **Separation of concerns:** Content, presentation (templates/layouts/widgets), and infrastructure are kept in distinct layers, as already defined by the domain model below. Reusable logic is extracted to shared utilities.
- **Security:** All user input (panel forms, published Markdown frontmatter, localStorage-equivalent config) is validated before use. No `innerHTML`, `eval`, `new Function`, or `document.write` in the panel's Vue frontend.
- **Documentation sync:** `claude.md`, `readme.md`, and the applicable `spec.md` are updated after every change that affects structure, decisions, or working rules.
- **Destructive actions require typed confirmation:** any delete affecting stored content (category, tag, author, post) requires a modal where the user types the literal word "confirm" or "delete" (per case) before the action executes. See `panel/spec.md` for the exact rule per entity.

---

## Repository Structure

```
textual/
├── package.json                  # npm workspaces root
├── spec.md                       # This document — monorepo contract
├── claude.md                     # Claude Code working instructions (repo-wide)
├── readme.md                     # Developer setup and deployment guide
│
├── blog/
│   ├── spec.md                   # Blog contract — inherits this document
│   ├── frontend/                 # Astro SSG site
│   │   ├── src/
│   │   │   ├── content/
│   │   │   │   ├── posts/{lang}/{slug}.md
│   │   │   │   ├── categories/{id}.json
│   │   │   │   ├── tags/{id}.json
│   │   │   │   └── authors/{id}.json
│   │   │   ├── content.config.ts     # Astro Content Collections schemas
│   │   │   ├── site.config.json      # defaultLang, supportedLangs, defaultCoverImage, siteUrl
│   │   │   ├── templates/
│   │   │   │   └── default/
│   │   │   │       ├── layouts/
│   │   │   │       └── widgets/
│   │   │   ├── pages/
│   │   │   │   ├── index.astro
│   │   │   │   ├── [...slug].astro       # post resolution, i18n-aware
│   │   │   │   ├── historico/[page].astro
│   │   │   │   ├── categoria/[slug]/[page].astro
│   │   │   │   ├── tag/[slug]/[page].astro
│   │   │   │   ├── autor/[slug]/[page].astro
│   │   │   │   ├── sitemap.xml.ts
│   │   │   │   ├── robots.txt.ts
│   │   │   │   └── rss.xml.ts
│   │   │   └── assets/posts/{translationId}/cover.jpg
│   │   ├── scripts/
│   │   │   ├── validate-integrity.mjs
│   │   │   └── detect-changed-views.mjs
│   │   └── astro.config.mjs
│   │
│   └── infra/                    # CDK v2, deployed from local — single stack, region us-east-1
│       ├── bin/textual.ts
│       ├── lib/
│       │   ├── textual-stack.ts      # hosted-zone reference + certificate + both buckets + CloudFront
│       │   └── constructs/
│       │       ├── static-site.ts            # S3 (entries) + S3 (shell) + CloudFront (OAC ×2)
│       │       └── root-redirect-function.ts # CloudFront Function: exact "/" → 301 "/{defaultLang}/"
│       ├── cdk.json
│       └── .env
│
├── panel/
│   ├── spec.md                   # Panel contract — inherits this document
│   ├── frontend/                 # Vue app, localhost-only
│   │   └── src/
│   │       ├── views/
│   │       │   ├── PostEditor.vue
│   │       │   ├── Categories.vue
│   │       │   ├── Tags.vue
│   │       │   └── Authors.vue
│   │       └── components/
│   └── backend/                  # Local-only mini server (never deployed)
│       ├── routes/
│       │   ├── posts.ts
│       │   ├── categories.ts
│       │   ├── tags.ts
│       │   └── authors.ts
│       └── lib/
│           ├── integrity.ts      # referential-integrity rules, shared by all routes
│           └── fsWriter.ts       # atomic writes to blog/frontend/src/content and *.config.json
│
└── .github/
    └── workflows/
        └── deploy-blog.yml       # path filter: blog/frontend/** — content pipeline only
```

### Notes on structure

- `blog/infra` is deployed **from local only** (`cdk deploy`). It changes infrequently and carries more risk than content publishing; the GitHub Actions workflow never touches it and therefore never needs CDK/CloudFormation IAM permissions.
- `panel/backend` never runs in production. It exists solely to give the local Vue panel a place to perform validated file I/O against `blog/frontend/src/content` and the `*.config.json` files. It is not part of any deploy pipeline.
- GitHub Actions workflows live at the **repo root** under `.github/workflows/`, per GitHub's requirement; path filters achieve per-subproject isolation.
- No domain names, subdomains, or account IDs are hardcoded anywhere in source or documentation.

---

## Tech Stack

### Blog — frontend

| Concern | Technology |
|---|---|
| Meta-framework | Astro (latest) — SSG, no server runtime |
| Content | Astro Content Collections (Zod schemas) |
| Language | TypeScript (strict) |
| Styling | CSS custom properties, per-template |
| Images | Astro `<Image>` component (resize, WebP/AVIF, lazy loading) |

### Blog — infra

| Concern | Technology |
|---|---|
| IaC | AWS CDK v2, TypeScript — single stack |
| Stack region | `us-east-1` for the whole stack — none of its resources (S3, CloudFront, Route 53) are region-sensitive except the ACM certificate CloudFront requires in `us-east-1`; deploying the entire stack there avoids a cross-region certificate reference |
| Hosting | 2× S3 (private) — `entries` and `shell` — + 1× CloudFront (2 behaviors, 2 OACs) |
| Root redirect | 1× CloudFront Function on the `shell` behavior — exact match on `/`, 301 to `/{defaultLang}/`; `defaultLang` baked in at synth time from `DEFAULT_LANG` in `.env` |
| DNS | Route 53 — existing hosted zone, referenced not created |
| TLS | ACM certificate in `us-east-1` |
| Deploy | From local — `cdk deploy` |
| CI/CD | GitHub Actions — content only: validate → build → S3 sync (×2) → CloudFront invalidation |

### Panel — frontend

| Concern | Technology |
|---|---|
| Framework | Vue (latest) |
| Scope | Localhost only — never deployed |
| Markdown preview | Any client-side Markdown renderer (preview only; publishing writes raw Markdown, see Domain Model) |

### Panel — backend (local mini-server)

| Concern | Technology |
|---|---|
| Runtime | Node, local dev server (e.g. Vite dev server + API routes, or a minimal Express/Fastify instance) |
| Responsibility | CRUD for posts/categories/tags/authors with referential-integrity validation; atomic file writes |
| Deploy | Never — local development tool only |

---

## Domain Model

This is the canonical schema for all content entities. `blog/frontend` reads it via Astro Content Collections; `panel/backend` writes it via `fsWriter.ts`. Both subprojects must stay in sync with this section — any change here requires updating both subproject specs in the same commit.

### Post

One Markdown file per post, per language, at `blog/frontend/src/content/posts/{lang}/{slug}.md`. Frontmatter is the sole metadata source (Content Collections **Option A** — no separate JSON index for posts).

```yaml
---
translationId: black-holes-formation   # shared across language versions of the same piece
lang: es                               # es | en
slug: como-se-forman-los-agujeros-negros
title: "¿Cómo se forman los agujeros negros?"
description: "Meta description for SEO, 150–160 characters."
authorId: ignacio-garza
categoryId: fisica
tagIds: [astrofisica, relatividad]
coverImage:
  src: /assets/posts/black-holes-formation/cover.jpg
  alt: "Simulación de un agujero negro deformando la luz de fondo"   # required, non-empty
createdAt: 2026-07-01
updatedAt: 2026-07-03
published: true
---
Post body in Markdown...
```

### Category — `blog/frontend/src/content/categories/{id}.json`

```json
{
  "id": "fisica",
  "es": { "slug": "fisica", "title": "Física", "description": "..." },
  "en": { "slug": "physics", "title": "Physics", "description": "..." }
}
```

### Tag — `blog/frontend/src/content/tags/{id}.json`

```json
{
  "id": "relatividad",
  "es": { "slug": "relatividad", "title": "Relatividad" },
  "en": { "slug": "relativity", "title": "Relativity" }
}
```

### Author — `blog/frontend/src/content/authors/{id}.json`

```json
{
  "id": "ignacio-garza",
  "es": { "name": "Ignacio Garza", "bio": "...", "avatar": "/assets/authors/ignacio.jpg" },
  "en": { "name": "Ignacio Garza", "bio": "...", "avatar": "/assets/authors/ignacio.jpg" },
  "social": { "twitter": "...", "linkedin": "...", "github": "..." }
}
```

### Site config — `blog/frontend/src/site.config.json`

```json
{
  "defaultLang": "es",
  "supportedLangs": ["es", "en"],
  "defaultCoverImage": "/assets/site/default-cover.jpg",
  "siteUrl": "https://textual.example.com"
}
```

`siteUrl` is a placeholder here; the real value is environment-specific and must be injected from `.env` at build time, never hardcoded in the committed file.

### Referential-integrity rules (canonical — enforced in two places, see below)

| Rule | Enforced by |
|---|---|
| `post.categoryId` must reference an existing category | `panel/backend` on write, `validate-integrity.mjs` on build |
| `post.authorId` must reference an existing author | same |
| every `post.tagIds[]` must reference an existing tag | same |
| `post.slug` unique **within its language** | same |
| at most one post per `translationId` per language | same |
| a category cannot be deleted while referenced by any post | `panel/backend` only (blocking UI action) |
| an author cannot be deleted while referenced by any post | `panel/backend` only |
| a tag **can** be deleted while referenced; deletion removes the reference from all affected posts, after a confirmation showing the affected count | `panel/backend` only |
| translations of the same `translationId` should share the same `categoryId`; mismatch is flagged (warning in the panel, hard error in CI) | both, different severity |
| `site.config.json.defaultLang` must be included in `supportedLangs` | `validate-integrity.mjs` |
| `site.config.json.defaultCoverImage` must resolve to an existing file | `validate-integrity.mjs` |

Full detail, scripts, and UI flows for these rules live in `blog/spec.md` (CI enforcement) and `panel/spec.md` (panel enforcement + confirmation modals).

---

## i18n & SEO Contract

- Supported languages: Spanish (`es`) and English (`en`), extensible via `supportedLangs`.
- **Every language, including the default one, is served under an explicit prefix** — `/es/...`, `/en/...`. There is no unprefixed content route; the bare root is not a page (see Root Redirect below). This avoids `x-default` ambiguity for crawlers and keeps routing symmetric across languages, with no special-casing for the default language.
- The bare domain root (`/`) is not a content page. It returns a `301` redirect to `/{defaultLang}/`, generated by a CloudFront Function (edge-only, no server) attached to the `shell` behavior, matching the exact path `/`. The redirect target is fixed and deterministic — it does not vary by `Accept-Language`, geography, or any per-request signal, so every visitor and every crawler is redirected identically. Deep links (`/es/mi-post`), static assets, and files like `/sitemap.xml` or `/robots.txt` are untouched by this rule.
- Each post has its own localized `slug`; translations of the same piece are linked by a shared `translationId`, never by a shared slug.
- Every category, tag, and author has localized `title`/`name`/`description`/`bio` but a single canonical `id` used internally — taxonomy and authorship are never fragmented by language.
- Every post page renders `<link rel="alternate" hreflang="...">` for each language it has a translation in, built from the `translationId` index, plus `hreflang="x-default"` pointing at the absolute URL of the `/{defaultLang}/` version.
- `coverImage.alt` is mandatory on every post; a site-wide `defaultCoverImage` exists for any listing context that needs a fallback image, though every individual post must supply its own before it can be published.
- Cover images are rendered through Astro's `<Image>` component for automatic resize, format conversion (WebP/AVIF), and lazy loading — never referenced as a raw `<img src>`.
- `sitemap.xml`, `robots.txt`, and `rss.xml` are generated at build time and are mandatory deliverables of `blog/frontend`, not a later-stage feature.

---

## CI/CD Contract

- **`blog/infra` is never touched by CI.** It is deployed manually from local via `cdk deploy`. The GitHub Actions workflow requires no CloudFormation/CDK IAM permissions — only scoped S3 (both buckets) and CloudFront (create-invalidation) permissions.
- **`blog/frontend` has a single workflow**, `deploy-blog.yml`, triggered on push to `main` with a path filter on `blog/frontend/**`. Steps, in order:
  1. `astro sync` — regenerates Content Collection types, validates frontmatter against Zod schemas (fails the build on shape errors)
  2. `node scripts/validate-integrity.mjs` — referential-integrity checks (see Domain Model table above)
  3. `node scripts/detect-changed-views.mjs` — determines which aggregator pages (home, affected category/tag/author listings, sitemap, rss) are impacted by the changed post(s)
  4. `astro build`
  5. sync build output for individual post pages to the **entries** bucket
  6. sync build output for everything else (home, listings, sitemap, rss, robots, shared assets) to the **shell** bucket
  7. CloudFront invalidation limited to the paths identified in step 3, plus the newly-added entry paths
- **`panel/backend` is not part of any CI pipeline.** It only runs locally.
- Bucket names and the CloudFront distribution ID are injected via GitHub Actions secrets, never hardcoded in the workflow file.

---

## Security Contract

- Both S3 buckets (`entries`, `shell`) are fully private; access is granted exclusively to CloudFront via a dedicated Origin Access Control (OAC) per bucket, each scoped to that bucket's own distribution/behavior.
- The GitHub Actions IAM role/user is scoped to `s3:PutObject`/`s3:DeleteObject` on the two specific buckets and `cloudfront:CreateInvalidation` on the specific distribution — nothing broader, given the repository is public.
- `panel/backend` runs on localhost only; it is never exposed to a network interface beyond loopback, and is never deployed.
- All panel form input is validated before it reaches `fsWriter.ts`; no raw user input is interpolated into file paths (path traversal protection on `slug`, `id`, and `lang` values).
- Destructive actions in the panel (category delete, author delete, tag delete) require a modal where the user types the literal confirmation word before the action proceeds — no destructive action fires from a single click.
- `validate-integrity.mjs` is the last line of defense against manual edits to committed Markdown/JSON that bypass the panel; CI must fail the build on any referential-integrity violation.

---

## Environment Variables

### `blog/infra/.env`

```
STACK_NAME=             # name of the whole stack; drives the CloudFormation stack name and the
                        # prefix of every auto-generated resource name, so the same project can be
                        # deployed as multiple independent stacks (one .env per subdomain / fork)
DOMAIN_NAME=
SUBDOMAIN=
HOSTED_ZONE_ID=
CERTIFICATE_ARN=
DEFAULT_LANG=            # baked into the root-redirect CloudFront Function at synth time, e.g. es
AWS_ACCOUNT_ID=
AWS_REGION=us-east-1     # required — the entire stack deploys here (see Tech Stack)
AWS_PROFILE=             # optional
```

### `blog/frontend/.env`

```
PUBLIC_SITE_URL=
PUBLIC_TEMPLATE=         # active template under src/templates/, build-time; defaults to "default"
```

### GitHub Actions secrets (repo-level, not a file)

```
AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   # scoped per Security Contract above
ENTRIES_BUCKET_NAME
SHELL_BUCKET_NAME
CLOUDFRONT_DISTRIBUTION_ID
```

### GitHub Actions repository variables (non-sensitive)

```
PUBLIC_SITE_URL   # absolute public site URL for astro build; a repo variable, not a secret
```

### `panel/backend/.env`

```
BLOG_CONTENT_PATH=       # absolute or relative path to blog/frontend/src/content
BLOG_CONFIG_PATH=        # path to blog/frontend/src (categories/tags/authors/site config)
PANEL_PORT=              # localhost port for the mini backend
```

No domain, account ID, bucket name, distribution ID, or any environment-specific value is hardcoded anywhere in source or documentation.

---

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-03 | Static Site Generation (SSG) instead of true per-request SSR | Blog content changes on publish, not per-request or per-user; SSG gives identical SEO to SSR (full HTML at first byte) at zero compute cost. Category-based dynamic layouts are resolved at build time from post frontmatter, not at request time |
| 2026-07-03 | Two S3 buckets — `entries` (individual post pages) and `shell` (home, listings, sitemap/rss/robots, shared assets) — behind one CloudFront distribution with two behaviors | Entries are near-immutable once published (long TTL, rarely invalidated); the shell changes on every publish (short TTL / explicit invalidation). Splitting avoids either an inefficient shared TTL or invalidating the whole site on every new post |
| 2026-07-03 | Content Collections **Option A**: post frontmatter is the single source of truth (no separate posts JSON index); categories/tags/authors remain separate `data`-type collections | Reduces indirection versus a parallel JSON index (`contentFile` field would only duplicate what `lang` + `slug` already determine); Markdown frontmatter is Astro's native use case for this |
| 2026-07-03 | Posts are linked across languages via a shared, non-URL `translationId`; each language keeps its own localized `slug` | Localized slugs carry SEO value per language; a shared opaque ID lets the build generate `hreflang` alternates and the panel's language-switcher UI without slug collisions |
| 2026-07-03 | Categories, tags, and authors have one canonical `id` with per-language display fields, not one entity per language | Prevents the same category from fragmenting into disconnected per-language taxonomies (e.g. "física" vs "physics" as unrelated entries) |
| 2026-07-03 | `coverImage` is mandatory per post, with `alt` mandatory and non-empty; a site-wide `defaultCoverImage` exists as a listing-context fallback only | SEO and accessibility are stated priorities from the project's base definition; the fallback exists for robustness, not as a way to skip providing a real cover image |
| 2026-07-03 | Cover images render through Astro's `<Image>` component | Gets automatic resize, WebP/AVIF conversion, and lazy loading for free, directly supporting the stated performance priority |
| 2026-07-03 | Categories and authors block deletion while referenced by any post; tags allow deletion with a confirmation showing the affected post count | A post cannot be left without a category or an author (both are single-value, mandatory fields), so deletion must be blocked until reassignment. Tags are a multi-value, optional field — blocking their deletion would make cleanup impractical over time |
| 2026-07-03 | Referential integrity is enforced in two layers: `panel/backend` at write time, `scripts/validate-integrity.mjs` at CI build time | The panel is the primary and only intended write path, but the repository is public — a manual edit to a committed Markdown/JSON file must not be able to reach production undetected |
| 2026-07-03 | `validate-integrity.mjs` runs against Astro's own `getCollection()` output after `astro sync`, rather than re-implementing frontmatter/JSON parsing | Avoids maintaining two parallel parsers for the same content; reuses Astro's already-typed and already-validated collection data for the referential checks Zod cannot express |
| 2026-07-03 | `blog/infra` is deployed exclusively from local (`cdk deploy`); GitHub Actions only ever touches `blog/frontend` and has no CDK/CloudFormation permissions | Infra changes are infrequent and carry more risk than content publishing; keeping the CI IAM surface limited to S3 + CloudFront invalidation reduces blast radius in a public repository |
| 2026-07-03 | Origin Access Control (OAC), one per bucket, over the legacy Origin Access Identity (OAI) | OAC is the current AWS-recommended mechanism; keeps both buckets fully private while granting only the specific CloudFront distribution scoped read access |
| 2026-07-03 | `panel/backend` exists as a small local-only server rather than having the Vue frontend write to the filesystem directly | Browser JS cannot perform arbitrary filesystem writes; a minimal local backend is the smallest viable solution, and it is the natural place to centralize referential-integrity validation shared by all panel views |
| 2026-07-03 | Destructive actions in the panel require typing a literal confirmation word ("confirm" or "delete", per case) in a modal | Prevents accidental data loss from a single misclick, given there is no undo and no database transaction log behind these file writes |
| 2026-07-06 | Single CDK stack for `blog/infra` (no separate `dns-stack`/`site-stack`), deployed entirely in `us-east-1` | Infra changes are infrequent and deployed together as one unit; the developer has no need for independent lifecycles between DNS/certificate and buckets/CloudFront. None of the stack's resources (S3, CloudFront, Route 53) are region-sensitive except the ACM certificate CloudFront requires in `us-east-1` — deploying the whole stack there sidesteps any cross-region certificate reference entirely |
| 2026-07-06 | Every language, including the default, is served under an explicit URL prefix (`/es/`, `/en/`); there is no unprefixed content route | Removes `x-default`/crawler ambiguity that an unprefixed default language would introduce; keeps `[lang]`-based routing symmetric with no special-casing for the default language |
| 2026-07-06 | The bare domain root (`/`) is not a content page; it returns a deterministic `301` to `/{defaultLang}/` via a CloudFront Function, never based on `Accept-Language` or geolocation | Content-based redirects on the root URL are a known SEO anti-pattern (Googlebot and different users could see different destinations from the same URL); a fixed, always-identical redirect target keeps indexing and canonicalization simple. A CloudFront Function is edge-only and effectively free, so this does not reintroduce a server |
| 2026-07-06 | (Stage 4) `validate-integrity.mjs`'s CI gate reads the committed content files directly (shared raw reader) instead of Astro's `getCollection()` output — superseding the 2026-07-03 "reuse getCollection" decision for the CLI path only | `astro:content` is a build-only virtual module and cannot be imported from a standalone Node process, so the pre-build gate (`node scripts/validate-integrity.mjs`) reads the same files Astro reads. `detect-changed-views.mjs` already needs a raw reader (for git-historical versions Astro can't provide), so both CI scripts share one reader — keeping the "no second parser" intent (one parser, not two). The pure, unit-tested check logic is unchanged |