# Textual — Blog

Statically generated (SSG) blog built with Astro, with SEO and performance as first-class
priorities. No server runtime, no database: all content is Markdown + JSON committed to the
repository and produced by `../panel/`. This subproject has two parts:

- **`frontend/`** — the Astro site and the content pipeline scripts.
- **`infra/`** — a single AWS CDK stack (S3 ×2 + CloudFront + root redirect), deployed from local.

The authoritative contract is [`spec.md`](./spec.md) (and the monorepo [`../spec.md`](../spec.md)).
Working rules for Claude Code are in [`claude.md`](./claude.md).

## Requirements

- Node.js 20+ and npm
- For infra only: AWS credentials, an existing Route 53 hosted zone, and an ACM certificate in
  `us-east-1` (see [`infra/readme.md`](./infra/readme.md))

## Frontend — local development

```bash
cd blog/frontend
npm install
cp .env.example .env    # set PUBLIC_SITE_URL (absolute URL, no trailing slash)

npm run dev             # astro dev server
npm run build           # astro build -> dist/
npm run preview         # serve the built site
```

### Scripts

```bash
npm test                # Node's test runner: T-VAL-*, T-I18N-*, T-DIFF-*
npm run sync            # astro sync (regenerate collection types, validate frontmatter)
npm run validate-integrity   # referential-integrity gate (runs standalone)
```

## Content model & authoring (for manual edits)

The panel is the intended write path, but content is plain files, so manual edits are possible.
Anything committed must still pass `astro sync` (Zod shape) **and**
`node scripts/validate-integrity.mjs` (cross-references) — CI enforces both.

Layout on disk (see `spec.md` Domain Model for full field lists):

```
frontend/src/
├── content/
│   ├── posts/{lang}/{slug}.md        # frontmatter is the sole post metadata
│   ├── categories/{id}.json          # per-language slug/title/description
│   ├── tags/{id}.json                # per-language slug/title
│   └── authors/{id}.json             # per-language name/bio/avatar + social
├── site.config.json                  # defaultLang, supportedLangs, defaultCoverImage, siteUrl
└── assets/posts/{translationId}/cover.jpg
```

Authoring rules that the validators enforce:

- `categoryId`, `authorId`, and every `tagIds[]` entry must reference existing entities.
- `slug` is unique within its language; at most one post per `translationId` per language.
- Linked translations (same `translationId`) must share the same `categoryId` (hard CI error).
- Every post needs a `coverImage` with non-empty `alt`. The frontmatter `src` is
  `"/assets/posts/{translationId}/cover.jpg"`, which physically lives under
  `src/assets/posts/{translationId}/cover.jpg` so Astro's `<Image>` can optimize it.
- `site.config.json`: `defaultLang` must be in `supportedLangs`; `defaultCoverImage` must resolve
  under `public/`.

Tags are created only in their own collection — the post editor never invents tags on the fly.

## Deployment

Two independent paths, by design:

### Infrastructure (from local, infrequent)

`infra/` is deployed manually with `cdk deploy` and is **never** touched by CI. See
[`infra/readme.md`](./infra/readme.md). After deploy, copy the stack outputs
(`EntriesBucketName`, `ShellBucketName`, `DistributionId`) into the GitHub configuration below.

### Content (CI, on every publish)

`.github/workflows/deploy-blog.yml` (at the repo root) runs on push to `main` under the path
filter `blog/frontend/**`. Steps: `astro sync` → `validate-integrity` → `detect-changed-views`
→ `astro build` → S3 sync to the single site bucket (non-HTML long/immutable `Cache-Control`, HTML
short) → scoped CloudFront invalidation.

Configure in the GitHub repository (as secrets):

| Name | Source |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IAM user scoped to S3 (the site bucket) + `cloudfront:CreateInvalidation` only |
| `SITE_BUCKET_NAME` | infra stack output (`SiteBucketName`) |
| `CLOUDFRONT_DISTRIBUTION_ID` | infra stack output |
| `PUBLIC_SITE_URL` | absolute public site URL |

## Tests and their definitions

Test IDs and expectations live in `spec.md` (Unit Test Definitions). Implementations:

- `frontend/scripts/__tests__/validate-integrity.test.mjs` — `T-VAL-01…12`
- `frontend/src/lib/__tests__/hreflang.test.mjs` — `T-I18N-01…03`
- `frontend/scripts/__tests__/detect-changed-views.test.mjs` — `T-DIFF-01…06`
