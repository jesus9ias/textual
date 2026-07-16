# Textual

A blog with its own authoring tool, kept as two independent subprojects in one repository:

- **[`blog/`](./blog/readme.md)** — a statically generated (Astro) blog. No server runtime, no database: content is Markdown + JSON committed to the repo. Deployed to AWS (S3 + CloudFront) via GitHub Actions on every push to `main`.
- **[`panel/`](./panel/readme.md)** — the authoring tool for the blog's content. A local-only app (Vue frontend + Node backend) that reads and writes a local `blog/frontend` checkout. It is **never deployed** — there is no production build target, no hosting, no CI/CD for it.

The intended workflow is: author content with `panel/` against a local `blog/frontend` checkout → commit the resulting Markdown/JSON changes → push → CI validates and deploys `blog/`.

## Where to start

| Document | Purpose |
|---|---|
| [`spec.md`](./spec.md) | Monorepo contract: shared domain model, working discipline, decisions log. Read this first — it takes precedence over the subproject specs. |
| [`blog/spec.md`](./blog/spec.md) / [`blog/readme.md`](./blog/readme.md) | Blog contract / setup & deployment. |
| [`panel/spec.md`](./panel/spec.md) / [`panel/readme.md`](./panel/readme.md) | Panel contract / setup. |
| [`blog/CLAUDE.md`](./blog/CLAUDE.md) / [`panel/CLAUDE.md`](./panel/CLAUDE.md) | Working instructions for Claude Code, per subproject. |

## Requirements

- Node.js 24+ and npm (each subproject manages its own dependencies independently — there is no shared root `package.json`)
- For `blog/infra` only: AWS credentials, an existing Route 53 hosted zone, and an ACM certificate in `us-east-1` (see [`blog/infra/readme.md`](./blog/infra/readme.md))

## Quick start

```bash
# Blog — Astro site
cd blog/frontend
npm install
cp .env.example .env
npm run dev

# Panel — authoring tool (in separate terminals)
cd panel/backend
npm install
cp .env.example .env    # point BLOG_CONTENT_PATH / BLOG_CONFIG_PATH at your blog/frontend checkout
node main.ts

cd panel/frontend
npm install
cp .env.example .env
npm run dev
```

See each subproject's own readme for full setup, environment variables, tests, and deployment.

## Repository layout

```
textual/
├── spec.md                    # monorepo contract (source of truth)
├── invalidation-manifest.txt  # CloudFront invalidation paths pending publish (written by panel/, read by blog/ CI)
├── blog/                      # Astro SSG site + AWS CDK infra
└── panel/                     # local-only authoring tool (Vue frontend + Node backend)
```

`invalidation-manifest.txt` is the one piece of shared state between the two subprojects: `panel/` appends the CloudFront paths each content change affects, and `blog/`'s deploy workflow reads it to compute the invalidation for that publish. See `panel/spec.md`'s Publish Invalidation Manifest section and this repo's `spec.md` Decisions Log for the full mechanism.
