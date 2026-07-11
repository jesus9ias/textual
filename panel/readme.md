# Textual — Panel

The authoring tool for the Textual blog. It is used **only on `localhost`** by the developer and is
**never deployed** — no production build target, no hosting, no CI/CD. It is the intended single
write path into a local `blog/frontend` checkout.

- **`backend/`** — a minimal local Node server (`node:http`) exposing `/api/*` for CRUD over posts,
  categories, tags, and authors, with referential-integrity validation and atomic file writes.
- **`frontend/`** — a Vue 3 + Vite app (the editor UI) that talks to the backend.

The authoritative contract is [`spec.md`](./spec.md) (and the monorepo [`../spec.md`](../spec.md)).
Working rules for Claude Code are in [`claude.md`](./claude.md).

## Requirements

- Node.js 20+ (backend runs TypeScript directly via Node's native TS execution) and npm
- A local checkout of `blog/frontend` — the panel reads and writes its content

## How the panel points at the blog

The backend operates against a local `blog/frontend` checkout, configured via `.env`:

| Variable | Points at | Example |
|---|---|---|
| `BLOG_CONTENT_PATH` | `blog/frontend/src/content` — `posts/` and the `categories`/`tags`/`authors` JSON | `../../blog/frontend/src/content` |
| `BLOG_CONFIG_PATH` | `blog/frontend/src` — where `site.config.json` lives | `../../blog/frontend/src` |
| `INVALIDATION_MANIFEST_PATH` | the CloudFront invalidation manifest — repo root, outside `blog/` | `../../invalidation-manifest.txt` |
| `PANEL_PORT` | localhost port for the backend | `4321` |

> The panel writes real content files. Point it at a working copy you are comfortable editing, and
> commit those changes through git as usual — CI (`blog`) validates them on publish.

## Backend — run and test

```bash
cd panel/backend
npm install
cp .env.example .env          # then set the paths above

npm test                      # T-INT-*, T-FS-*, T-FIELD-* + route tests (Node's runner)
npm run typecheck             # tsc --noEmit

node main.ts                  # start the backend (binds 127.0.0.1:$PANEL_PORT)
```

The backend binds strictly to loopback and is never exposed to a network interface beyond
`localhost`.

## Frontend — run

```bash
cd panel/frontend
npm install
cp .env.example .env          # set PANEL_PORT to match the backend (see below)
npm run dev                   # Vite dev server on http://localhost:5173
```

The dev server proxies `/api` to the backend. `npm run build` runs `vue-tsc` + `vite build` (there
is no deploy — build is only a type/compile check).

### The ports must match

Each subproject has its own `.env`. The frontend's `PANEL_PORT` is the backend port the dev server
proxies `/api` to, so it **must equal** the `PANEL_PORT` in `panel/backend/.env`. If they differ,
the app's API calls hit nothing (the proxy targets the wrong port). Both default to `4321`.

| File | `PANEL_PORT` means |
|---|---|
| `panel/backend/.env` | the port the backend listens on |
| `panel/frontend/.env` | the backend port the dev server proxies `/api` to (must match the backend) |

### Running both together

1. Terminal A: `cd panel/backend && node main.ts` (with `.env` pointing at your blog checkout).
2. Terminal B: `cd panel/frontend && npm run dev`.
3. Open `http://localhost:5173`.

## What the panel enforces (mirrors the specs)

- **Referential integrity at write time:** `categoryId`/`authorId`/`tagIds` must resolve to existing
  entities; `slug` is unique within its language — checked before any file is written.
- **Atomic writes:** temp file then rename, so an interrupted write never corrupts content.
- **Destructive-action safety:** deleting a post/category/author/tag requires typing **"eliminar"**.
  Categories and authors cannot be deleted while referenced — the panel shows the affected count and
  offers a bulk-reassignment flow first. Tags can always be deleted; the modal shows how many posts
  will lose the tag, and the reference is removed from each on confirm.
- **Translation linking:** the editor offers only pieces missing a version in the language being
  edited; linking copies that piece's `translationId`. A category mismatch shows a non-blocking
  warning (CI turns the same condition into a hard error).
- **Publish gate:** a cover image and non-empty alt text are required before publishing.
- **Preview transparency:** the Markdown preview is approximate (rendered in a sandboxed iframe);
  the published HTML is produced by Astro at blog build time.

## CloudFront invalidation

Every post/category/tag/author create, edit, or delete appends the CloudFront paths it affects to
`invalidation-manifest.txt` (repo root, outside `blog/`) — de-duplicated against whatever is
already pending since the last publish. This replaces `blog/`'s old git-diff-based change
detection: the panel already knows exactly what changed (and, for deletes, its state right before
removal), so nothing needs to be reconstructed from git history afterward.

After you push and confirm a deploy actually succeeded (check the GitHub Actions run or the live
site — the panel has no visibility into either), click **"Marcar publicación"** in the topbar. It
appends a `---YYYY/MM/DD` cut marker to the manifest; the next CI run only invalidates what's
pending after the most recent marker. Forgetting to click it just means the next publish
invalidates a few extra paths — never too few. The manifest file can also be trimmed by hand at any
time (e.g. to drop stale entries from an abandoned change); commit it like any other file.

## Tests and their definitions

Test IDs and expectations live in `spec.md` (Unit Test Definitions). Implementations:

- `backend/lib/__tests__/integrity.test.ts` — `T-INT-01…14`
- `backend/lib/__tests__/fsWriter.test.ts` — `T-FS-01…03`
- `backend/lib/__tests__/fieldValidation.test.ts` — `T-FIELD-01…04`
- `backend/lib/__tests__/invalidationPaths.test.ts` — `T-MANIFEST-01…08`
- `backend/routes/__tests__/*.test.ts` — route-level tests exercising the panel Gherkin scenarios
  over real HTTP against a temp fixture content directory.
