# Claude Code — working instructions for `panel/`

Read `../spec.md` (monorepo contract) and `./spec.md` (panel contract) before acting on any
prompt. Those are the source of truth; this file summarizes the working rules and the non-obvious
conventions already in place. In any conflict, the specs win — and the monorepo spec wins over the
panel spec.

`panel/` is the authoring tool for `blog/` content. It is **localhost-only and never deployed**:
a Vue frontend (`panel/frontend`) plus a minimal local Node backend (`panel/backend`) that is the
intended single write path into a local `blog/frontend` checkout.

## Working discipline (panel-specific reminders)

- **Spec-first & stage discipline.** Every feature traces to a Gherkin scenario. Stages run in
  order; stop and wait for authorization between them. Stages 1–4 are delivered (see the panel
  spec "Delivery status"); further changes are scoped work, not new stages, unless the developer
  says so.
- **TDD gate.** Backend tests and their definitions (`T-INT-*`, `T-FS-*`, `T-FIELD-*`) are not
  created or modified without explicit developer authorization. Write/adjust tests first, see them
  fail, then implement. (The UI stage has no test IDs — it is verified manually against a running
  panel.)
- **Conflict detection.** If a change contradicts a spec or a prior Decisions Log entry, stop,
  alert the developer, and — only if confirmed — update the documentation first, then the code.
- **Visual design source.** `panel/design/` (a Claude Design handoff bundle: `Blog Panel.dc.html` +
  `readme.md` + `uploads/`) is the source of truth for the panel's look — dark glass theme,
  `Sora`/`IBM Plex Sans`, gradient accents — see "UI Design Reference" in the panel spec. It is a
  prototype, not a functional spec: reconcile any behavioral gap against this document's Integrity
  Rules per the Conflict detection rule above, and log the reconciliation in the Decisions Log (see
  the 2026-07-10 entries for precedent).
- **No magic values.** Constants live in dedicated spots (rule codes / patterns in `integrity.ts`
  and `fsWriter.ts`, config in `config.ts` / `.env`).
- **Security is enforced, not optional.**
  - The backend runs on loopback only (`main.ts` binds `127.0.0.1`) and is never deployed.
  - Every relational field is validated against real, currently-existing ids before a write —
    never trusted from client state.
  - All file writes are atomic (temp file then rename); `slug`/`id`/`lang` are pattern-validated
    to block path traversal before building any filesystem path.
  - The Vue frontend uses **no `innerHTML`/`v-html`, `eval`, `new Function`, or `document.write`**.
    The Markdown preview renders inside a sandboxed `<iframe srcdoc>` (script-less) and
    "open in new tab" uses a Blob URL.
  - Every destructive action (delete of post/category/author/tag) requires typing **"eliminar"**
    in the shared `ConfirmModal` — no delete fires from a single click.

## Architecture conventions already established

### Backend (`panel/backend`)

- **Pure integrity core, separate from I/O.** `lib/integrity.ts` holds pure functions over
  in-memory snapshots (the `T-INT-*`/`T-FIELD-*` logic + the `postFrontmatterSchema` zod copy);
  `lib/fsWriter.ts` holds serialization + atomic writes + path sanitization. Keep them pure and
  filesystem-free respectively so they stay unit-testable.
- **`postFrontmatterSchema` is a panel-local copy** of the canonical Domain Model — the blog's own
  schema imports the build-only `astro:content` and cannot be reused from Node. Update both on any
  Domain Model change.
- **`lib/store.ts` is the only content I/O layer.** Every route mutation goes through the store,
  which reads current content, builds the `ContentSnapshot`, runs `integrity.ts`, then persists via
  `fsWriter.ts` (including the tag-deletion cascade). Post id is `"{lang}:{slug}"` (one URL-safe
  segment; posts have no standalone id).
- **No web framework:** `lib/router.ts` is a ~90-line `node:http` router. Route tests boot the
  server on an ephemeral loopback port and use real `fetch` against a temp fixture content dir —
  never the real blog content.
- **Backend is TypeScript run on Node's native TS execution** (`node --test`/`node main.ts`); use
  only erasable type syntax and `.ts` import extensions.
- **Paths from `.env` only:** `BLOG_CONTENT_PATH` = `blog/frontend/src/content`,
  `BLOG_CONFIG_PATH` = `blog/frontend/src`, `PANEL_PORT`. Never hardcode a path.

### Frontend (`panel/frontend`)

- **Vue 3 + Vite; navigation is a reactive `view` ref**, not `vue-router`.
- **`styles.css` implements the design system** as reusable classes (`.panel`, `.modal`, `.badge`,
  `.chip`, `.toggle`, `.nav-pill`, etc.), translated from `panel/design/Blog Panel.dc.html`'s inline
  styles into design tokens + component classes. Extend these classes for new UI rather than
  copying raw inline styles out of the mockup.
- **`api.ts`** is the single fetch wrapper; requests are same-origin `/api/...` and the Vite dev
  server proxies them to the backend (`PANEL_PORT`). No backend URL in source.
- **`ConfirmModal.vue`** centralizes the typed-word gate for all deletes. Category/author deletes
  run a bulk-reassignment flow first (PUT each affected post to a replacement, then delete). The
  tag-delete count is computed client-side from `GET /api/posts` (there is no tag-usage endpoint).
- **PostEditor** gates publish on a cover image + non-empty alt; offers a translation-link selector
  limited to pieces missing a version in the target language; shows a non-blocking category-mismatch
  warning. Tags are chosen from existing tags only (created in the Tags view).

## Verifying changes

- Backend tests: `cd panel/backend && npm test` (Node's runner; `T-INT-*`, `T-FS-*`, `T-FIELD-*`
  + route tests) and `./node_modules/.bin/tsc --noEmit`.
- Frontend: `cd panel/frontend && npm run build` (`vue-tsc --noEmit` + `vite build`).
- Live: run the backend against a **copy** of a blog checkout (never mutate the real content in an
  exploratory run) and the Vite dev server; verify the relevant Gherkin scenarios by hand.
