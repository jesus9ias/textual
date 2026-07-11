# Panel — Subproject Spec

> This document is the source of truth for Claude Code on `panel/`. It inherits the full contract defined in the monorepo `spec.md` — read both before acting on any prompt. In case of conflict, the monorepo `spec.md` takes precedence unless a deviation is explicitly declared below.

---

## Overview

`panel/` is the authoring tool for `blog/` content. It is a Vue frontend plus a minimal local-only backend, used exclusively on `localhost` by the developer. It is the intended single write path to `blog/frontend/src/content/**` and the `categories`/`tags`/`authors`/`site` config files — though `blog/spec.md`'s CI validation exists precisely because this is not the *only* possible path (manual edits remain possible in a public repo).

`panel/` is **never deployed**. It has no production build target, no hosting, no CI/CD workflow.

---

## Deviations from Monorepo Contract

None.

---

## Responsibilities

| In scope | Out of scope |
|---|---|
| Create/edit/delete posts (writes Markdown with frontmatter) | Rendering the published blog (that's `blog/frontend`) |
| Create/edit/delete categories, tags, authors | Any production deploy |
| Markdown live preview (own renderer, approximate) | Being the source of truth for final HTML — that's Astro, at blog build time |
| Referential-integrity enforcement at write time | CI-level enforcement (that's `blog/frontend/scripts/validate-integrity.mjs`) |
| Confirmation modals for destructive actions | Authentication/authorization (single local user, not needed) |
| Generate CloudFront invalidation paths on every write, appended to the shared manifest (see Publish Invalidation Manifest) | Verifying a deploy succeeded — the publish-cut button is a manual assertion, not a CI signal |

---

## Entities Managed

Inherits the canonical Domain Model (Post, Category, Tag, Author, Site config) from the monorepo `spec.md` without modification. The panel is a CRUD surface over exactly those schemas — it introduces no additional fields.

---

## Integrity Rules (panel-enforced)

This is the authoritative detail behind the summary table in the monorepo `spec.md`.

### Category

- **Cannot be deleted while any post references it.** Attempting to delete shows the count of affected posts and offers a bulk-reassignment flow (pick a replacement category, apply to all affected posts) before the delete becomes available.
- Renaming `title`/`description` is unrestricted.
- Changing the `slug` (which is embedded in published URLs) requires a distinct, explicit confirmation step separate from a normal save, warning that already-indexed URLs will change.
- Deletion, once unblocked, still requires typing **"eliminar"** in a confirmation modal.

### Author

- **Cannot be deleted while any post references it.** Same reassignment flow as Category.
- Deletion requires typing **"eliminar"** in a confirmation modal.
- The panel must support multiple authors from the start (even though only one exists initially), including assigning an author per post.

### Tag

- **Can always be deleted**, regardless of usage. The confirmation modal must state the exact number of posts that will lose this tag reference, and typing **"eliminar"** confirms.
- On confirmed deletion, the tag is removed from `tagIds` on every affected post atomically with the tag's own removal from `tags.config`.
- Tags are created **only** from the Tags view — never inline/on-the-fly from the post editor. The post editor offers a selector limited to existing tags.

### Post — translation linking

- When creating or editing a post, the editor offers a "this is a translation of…" selector, listing existing posts that do **not yet have a translation in the language being edited** (i.e., filtered by: same `translationId`-eligible group, missing entry for the target `lang`).
- Selecting one copies its `translationId` onto the post being edited/created. Selecting none generates a new `translationId` (a readable slug-like string, not a UUID) when the post is first created.
- If the linked translation's `categoryId` differs from the post being edited, a non-blocking warning is shown (does not prevent saving) — this is the panel-side counterpart to the CI hard-error defined in `blog/spec.md`.
- The posts list view shows a visual indicator for posts that have no translation yet in the other supported language(s).

### General write-time validation (applies to all entities)

- Every relational field (`categoryId`, `authorId`, `tagIds`, `translationId` target) is checked against real, currently-existing IDs before a write is accepted — never trusted from client state alone.
- `slug` is checked for uniqueness within its `lang` before a post write is accepted.
- All file writes are atomic (write to a temp path, then rename) to avoid partial/corrupted files if the process is interrupted mid-write.
- `id`/`slug`/`lang` values are sanitized before being used to build a filesystem path — no path traversal, no arbitrary filenames.

---

## Post Editor

- Markdown editing with live preview; preview supports split-view (side-by-side) and a "open preview in new tab" mode.
- The preview renderer is a plain client-side Markdown-to-HTML library, used **only for the panel's own preview** — it is explicitly not the source of truth for the published site's HTML (that is Astro's own Markdown pipeline at blog build time, per the Option A decision in `blog/spec.md`). A visible "preview is approximate" note accompanies the preview pane.
- "Publish" writes the post's frontmatter + Markdown body directly to `blog/frontend/src/content/posts/{lang}/{slug}.md`, after passing all write-time validation above.
- Cover image: the editor requires selecting/uploading a cover image and entering non-empty alt text before publish is enabled — matching the mandatory-with-fallback rule from the monorepo spec (the fallback exists for blog listing robustness, not as an excuse to skip providing one here).

---

## UI Design Reference

The panel's visual design (dark glass theme, `Sora` + `IBM Plex Sans`, gradient accents) is sourced
from a Claude Design handoff bundle committed at `panel/design/` — `Blog Panel.dc.html` (the
exported prototype), `readme.md` (the handoff's own reading instructions), and reference images
under `panel/design/uploads/`.

`panel/design/` is the **visual source of truth** for future UI work: match its layout, spacing,
color tokens, and component states before inventing new ones. It is a design-tool prototype, not a
functional spec, and does not override anything else in this document. Where its markup implied
different behavior than the Integrity Rules / Gherkin scenarios above (the original export omitted
or simplified things like the typed-`"eliminar"` delete gate on some entities, the category
slug-change warning, and the post editor's translation-link selector), this document's rules win —
see the 2026-07-10 Decisions Log entries for the specific reconciliations already made when the
panel was restyled to match this mockup.

The design system is implemented as reusable CSS in `panel/frontend/src/styles.css` (tokens plus
`.panel`/`.modal`/`.badge`/`.chip`/`.toggle`/`.nav-pill`/etc. component classes), not as the
prototype's inline styles — extend those classes for new UI instead of duplicating raw values out
of the mockup.

---

## Backend Routes (`panel/backend`)

All routes operate against the paths configured in `panel/backend/.env` (`BLOG_CONTENT_PATH`, `BLOG_CONFIG_PATH`). All routes are localhost-only.

| Route | Method | Purpose |
|---|---|---|
| `/api/posts` | GET | List all posts (all languages), with translation-link status |
| `/api/posts/:id` | GET | Read one post's frontmatter + body |
| `/api/posts` | POST | Create a post — full write-time validation |
| `/api/posts/:id` | PUT | Update a post — full write-time validation |
| `/api/posts/:id` | DELETE | Delete a post file (no cross-entity block; posts are the leaf entity) |
| `/api/categories` | GET / POST | List / create category |
| `/api/categories/:id` | PUT | Update category (slug-change confirmation handled client-side before calling this) |
| `/api/categories/:id` | DELETE | Delete category — blocked if referenced, per Integrity Rules |
| `/api/categories/:id/usage` | GET | Returns the count and list of posts referencing this category (used to power the reassignment flow) |
| `/api/tags` | GET / POST | List / create tag |
| `/api/tags/:id` | PUT | Update tag |
| `/api/tags/:id` | DELETE | Delete tag — always allowed, removes references from affected posts, returns affected count |
| `/api/authors` | GET / POST | List / create author |
| `/api/authors/:id` | PUT | Update author |
| `/api/authors/:id` | DELETE | Delete author — blocked if referenced, per Integrity Rules |
| `/api/authors/:id/usage` | GET | Returns the count and list of posts referencing this author |
| `/api/publish-cut` | POST | Appends a `---YYYY/MM/DD` cut marker to the invalidation manifest |

Every mutating route runs its request body through `lib/integrity.ts` before touching the filesystem via `lib/fsWriter.ts`.

---

## Publish Invalidation Manifest

The panel is the source of the CloudFront invalidation list consumed by `blog/spec.md`'s
`compute-invalidation-paths.mjs` — see that spec for the CI-side contract. This section defines the
panel's write-side half.

### Path file

`INVALIDATION_MANIFEST_PATH` (`panel/backend/.env`) points at `invalidation-manifest.txt`, at the
**repository root** — deliberately outside `blog/`, so that editing it (including inserting a cut
marker) never matches `deploy-blog.yml`'s `blog/frontend/**` path filter and cannot re-trigger a
deploy. Format: one CloudFront path per line; a line starting with `---` is a cut marker
(`---YYYY/MM/DD`) rather than a path.

### Path generation (`lib/invalidationPaths.ts`)

A pure module, **independent from `blog/frontend/src/lib/routing.mjs`** (deliberately duplicated,
not imported or shared — see Decisions Log), computing the CloudFront paths a post/category/tag/author
change affects:

- A post create/update/delete always emits its own path as a wildcard (`/{lang}/{slug}/*` — the
  edge CloudFront Function rewrites it to `.../index.html` before the cache lookup, so a bare
  invalidation path never matches the real cached object), plus its shell: home (as
  `/{lang}/index.html`, same rewrite), `historico` wildcard, its category's wildcard listing, each
  of its tags' wildcard listings, its author's wildcard listing, `sitemap.xml`, and that language's
  `rss.xml`.
- A category/tag/author create/update (no post change) emits only its own wildcard listing
  path(s), for every supported language.
- A delete of any of the above computes paths from the entity's state **before** the write — the
  panel already holds this in memory, unlike a git-history reconstruction.

### Manifest write (`lib/store.ts`)

Every mutating route appends its computed paths to the manifest after a successful write, skipping
any path that is already present among the lines **after the last cut marker** (de-duplication —
no cut marker means the whole file is checked).

### Publish cut

`POST /api/publish-cut` appends a `---YYYY/MM/DD` line (today's date) to the manifest. Triggered by
a "Marcar publicación" button in the panel UI (a manual action; the panel has no visibility into
GitHub Actions, so this is the developer's own assertion that the last push actually deployed
successfully — see Decisions Log).

---

## Gherkin Feature Specifications

> All scenarios must be defined here before Stage 2 begins. No scenario is added or modified after Stage 2 without developer authorization.

### Feature: Category deletion integrity

```gherkin
Feature: Category deletion is blocked while referenced

  Scenario: Attempting to delete a category with posts shows the affected count
    Given category "fisica" is referenced by 4 posts
    When the developer attempts to delete "fisica"
    Then deletion is blocked
    And the modal shows "4 posts" affected
    And a reassignment flow is offered

  Scenario: Reassigning all affected posts unblocks deletion
    Given category "fisica" is referenced by 2 posts
    When the developer reassigns both posts to category "economia"
    Then category "fisica" is no longer referenced by any post
    And the delete action becomes available

  Scenario: Confirmed deletion requires typing "eliminar"
    Given category "fisica" is not referenced by any post
    When the developer clicks delete
    Then a confirmation modal requests the literal text "eliminar"
    And the category is not deleted until that text is entered and confirmed

  Scenario: Changing a category's slug requires a distinct warning
    Given category "fisica" has slug "fisica"
    When the developer changes the slug to "fisica-2"
    Then a warning is shown that already-published URLs will change
    And the change requires explicit confirmation separate from a normal save
```

### Feature: Author deletion integrity

```gherkin
Feature: Author deletion is blocked while referenced

  Scenario: Attempting to delete a referenced author is blocked
    Given author "ignacio-garza" is referenced by 6 posts
    When the developer attempts to delete this author
    Then deletion is blocked
    And the count of affected posts is shown

  Scenario: Author deletion succeeds once unreferenced
    Given author "guest-writer" has no posts referencing it
    When the developer deletes it after typing "eliminar"
    Then the author is removed from authors.config.json
```

### Feature: Tag deletion

```gherkin
Feature: Tags can always be deleted, with impact shown

  Scenario: Deleting a used tag shows the affected count
    Given tag "relatividad" is referenced by 5 posts
    When the developer attempts to delete "relatividad"
    Then the confirmation modal states "5 posts" will lose this tag
    And typing "eliminar" confirms the deletion

  Scenario: Confirmed tag deletion removes references from all affected posts
    Given tag "relatividad" is referenced by 5 posts
    When the developer confirms deletion
    Then "relatividad" is removed from tags.config.json
    And "relatividad" is removed from tagIds on all 5 posts

  Scenario: Deleting an unused tag requires no impact warning beyond zero-count
    Given tag "unused-tag" is referenced by 0 posts
    When the developer deletes it
    Then the confirmation modal states "0 posts" affected
```

### Feature: Post translation linking

```gherkin
Feature: Linking a post to its translation

  Scenario: Editor offers only posts missing a translation in the target language
    Given a post "black-holes-formation" exists in "es" with no "en" version
    And a post "other-topic" exists in both "es" and "en"
    When the developer creates a new post in "en"
    Then "black-holes-formation" appears as a linkable option
    And "other-topic" does not appear as a linkable option

  Scenario: Selecting a translation copies its translationId
    Given the developer is creating an "en" post
    And selects "black-holes-formation" as the linked translation
    When the post is saved
    Then its translationId matches the "es" post's translationId

  Scenario: No translation selected generates a new translationId
    Given the developer creates a post with no translation link
    When the post is saved
    Then a new, readable translationId is generated

  Scenario: Category mismatch between linked translations shows a non-blocking warning
    Given the "es" post has categoryId "fisica"
    When the developer links an "en" post with categoryId "economia" to it
    Then a warning is shown
    And saving is still allowed

  Scenario: Posts list flags untranslated posts
    Given a post exists only in "es"
    When the developer views the posts list
    Then that post shows a visual "missing translation" indicator
```

### Feature: Post publish flow

```gherkin
Feature: Publishing a post writes validated Markdown

  Scenario: Publish is disabled without a cover image and alt text
    Given the post editor has no cover image selected
    When the developer attempts to publish
    Then the publish action is disabled
    And a message indicates the cover image is required

  Scenario: Publish is disabled with an empty alt text
    Given a cover image is selected but its alt field is empty
    When the developer attempts to publish
    Then the publish action is disabled

  Scenario: Publish rejects an invalid categoryId
    Given the post form somehow holds a categoryId not present in categories.config.json
    When the developer attempts to publish
    Then the backend rejects the write with a validation error
    And no file is written

  Scenario: Publish rejects a duplicate slug within the same language
    Given a published "es" post already uses slug "mi-post"
    When the developer attempts to publish a new "es" post with the same slug
    Then the backend rejects the write
    And no file is written

  Scenario: Successful publish writes the Markdown file
    Given all validation passes
    When the developer publishes
    Then a file is written at posts/{lang}/{slug}.md with the correct frontmatter and body
    And the write is atomic (temp file then rename)
```

### Feature: Invalidation manifest generation

```gherkin
Feature: Every write appends the paths it affects to the invalidation manifest

  Scenario: Publishing a new post appends its entry and shell paths
    Given a new post is published with categoryId "fisica" and tagIds ["relatividad"]
    When the write succeeds
    Then the manifest gains the post's own path
    And the manifest gains home, historico, the "fisica" category listing, the "relatividad" tag
      listing, the post's author listing, sitemap.xml, and rss.xml for that language

  Scenario: Deleting a category appends its listing path using pre-deletion state
    Given category "fisica" is being deleted (already unblocked, unreferenced)
    When the deletion succeeds
    Then the manifest gains the "fisica" category listing path for every supported language

  Scenario: A path already pending since the last cut is not duplicated
    Given the manifest already contains a path after the last cut marker
    When a later write in the same session would emit that same path
    Then the manifest still contains that path exactly once

  Scenario: Marking a publish appends a dated cut marker
    Given the developer clicks "Marcar publicación" after confirming a deploy succeeded
    When the action completes
    Then the manifest gains a line starting with "---" followed by today's date
    And no existing line in the manifest is modified or removed
```

### Feature: Preview accuracy disclosure

```gherkin
Feature: Live preview transparency

  Scenario: Preview pane discloses it is approximate
    Given the developer opens the post editor
    Then the preview pane displays a visible note that it is an approximate rendering
    And that the published result is generated by Astro at blog build time
```

---

## Unit Test Definitions

> Definitions live here before implementation. No test is written without a definition here; no definition is added or modified after Stage 2 without developer authorization.

### `lib/integrity.ts`

| Test ID | Objective | Input | Expected output |
|---|---|---|---|
| `T-INT-01` | Rejects a post write with a non-existent categoryId | post payload, categoryId not in categories | `{ ok: false, error }` |
| `T-INT-02` | Rejects a post write with a non-existent authorId | post payload, authorId not in authors | `{ ok: false, error }` |
| `T-INT-03` | Rejects a post write with a non-existent tagId | post payload, one tagId not in tags | `{ ok: false, error }` |
| `T-INT-04` | Rejects a duplicate slug within the same lang | post payload, slug already used in that lang | `{ ok: false, error }` |
| `T-INT-05` | Accepts a valid post write | fully valid payload | `{ ok: true }` |
| `T-INT-06` | Blocks category deletion when referenced | categoryId referenced by ≥1 post | `{ ok: false, usageCount: N }` |
| `T-INT-07` | Allows category deletion when unreferenced | categoryId referenced by 0 posts | `{ ok: true }` |
| `T-INT-08` | Blocks author deletion when referenced | authorId referenced by ≥1 post | `{ ok: false, usageCount: N }` |
| `T-INT-09` | Allows author deletion when unreferenced | authorId referenced by 0 posts | `{ ok: true }` |
| `T-INT-10` | Tag deletion always allowed, returns usage count | tagId referenced by N posts | `{ ok: true, usageCount: N }` |
| `T-INT-11` | Tag deletion cascades reference removal | tagId referenced by 3 posts | 3 posts updated, tagId removed from each |
| `T-INT-12` | Flags category mismatch on translation link (non-blocking) | two posts, same translationId, different categoryId | `{ ok: true, warning: true }` |
| `T-INT-13` | Filters translation-link candidates correctly | set of posts across langs | Only posts missing the target lang returned |
| `T-INT-14` | Generates a new readable translationId when none is linked | post creation with no link selected | Non-empty, slug-shaped string, not already in use |

### `lib/fsWriter.ts`

| Test ID | Objective | Input | Expected output |
|---|---|---|---|
| `T-FS-01` | Writes are atomic | simulated interruption mid-write | Original file remains intact, or new file is fully written — never partial |
| `T-FS-02` | Path construction sanitizes slug/id/lang | payload with `../../etc/passwd`-style slug | Write rejected, path traversal blocked |
| `T-FS-03` | Post write produces valid frontmatter YAML | valid post payload | Output file parses back to the same object via the Content Collections schema |

### `lib/invalidationPaths.ts`

| Test ID | Objective | Input | Expected output |
|---|---|---|---|
| `T-MANIFEST-01` | Post change emits its own path as a wildcard (the edge function rewrites it to `.../index.html` before the cache lookup) | post descriptor | output includes `/{lang}/{slug}/*` |
| `T-MANIFEST-02` | Post change emits its full shell | post with categoryId X, tagIds [Y], authorId Z | output includes home, historico wildcard, category X wildcard, tag Y wildcard, author Z wildcard, sitemap.xml, rss.xml |
| `T-MANIFEST-03` | Post change does not emit unrelated category/tag paths | post with categoryId "fisica" | output excludes other categories'/tags' wildcards |
| `T-MANIFEST-04` | Category/tag/author-only change (no post) emits only its own listing | categories entity change | output = that entity's wildcard listing paths, one per supported language |
| `T-MANIFEST-05` | Deleting an entity computes paths from its pre-deletion state | entity snapshot taken before removal | output matches what a live (non-deleted) entity of the same shape would emit |
| `T-MANIFEST-06` | Appending a path already present since the last cut marker is a no-op | manifest with path A after the last cut; new write also emits path A | manifest unchanged (still contains A once) |
| `T-MANIFEST-07` | Appending a new path when the manifest has no cut marker yet checks the whole file | manifest with path A, no cut marker; new write emits path A again | manifest unchanged (still once) |
| `T-MANIFEST-08` | Publish-cut appends a correctly formatted marker line | current date | manifest gains one line matching `---YYYY/MM/DD`; all prior lines unchanged |

### Post name / field validation

| Test ID | Objective | Input | Expected output |
|---|---|---|---|
| `T-FIELD-01` | Rejects an empty title | `""` | `{ ok: false }` |
| `T-FIELD-02` | Rejects a description over 160 characters | 161-character string | `{ ok: false }` |
| `T-FIELD-03` | Rejects an empty cover image alt | `""` | `{ ok: false }` |
| `T-FIELD-04` | Accepts a well-formed post payload | valid payload | `{ ok: true }` |

---

## Implementation Stages

Stages are executed in strict order. Claude Code stops after each stage and waits for developer authorization to proceed.

### Delivery status

| Stage | Status | Notes |
|---|---|---|
| 1 — Backend integrity core | Done | `T-INT-01…14`, `T-FS-01…03`, `T-FIELD-01…04` green; `tsc --noEmit` clean |
| 2 — Backend routes | Done | Full route table wired to `integrity.ts`/`fsWriter.ts`; 14 route tests over real HTTP green; `tsc` clean |
| 3 — Panel UI | Done | Vue+Vite views/components; `vue-tsc` + `vite build` clean; Gherkin behaviors verified live against a running panel (untranslated indicator, publish gate, translation-link filtering, typed-word delete, reassignment) |
| 4 — Documentation | Done | `panel/claude.md`, `panel/readme.md`, finalized Decisions Log |

---

### Stage 1 — Backend integrity core

**Scope:** `lib/integrity.ts`, `lib/fsWriter.ts`, and their tests. No routes, no Vue UI.

**Deliverables:**
- `panel/backend/lib/integrity.ts`
- `panel/backend/lib/fsWriter.ts`
- `panel/backend/lib/__tests__/integrity.test.ts` covering every `T-INT-*` id
- `panel/backend/lib/__tests__/fsWriter.test.ts` covering every `T-FS-*` id
- `panel/backend/lib/__tests__/fieldValidation.test.ts` covering every `T-FIELD-*` id

**Constraints:** All tests written before implementation and initially failing. No route files in this stage.

---

### Stage 2 — Backend routes

**Scope:** Implement the route table above, wired to Stage 1's `integrity.ts`/`fsWriter.ts`.

**Deliverables:**
- `panel/backend/routes/posts.ts`, `categories.ts`, `tags.ts`, `authors.ts`
- `panel/backend/.env.example`
- Route-level tests exercising the Gherkin scenarios above via HTTP against a temp fixture content directory (never against real `blog/frontend/src/content`)

**Constraints:** No Vue UI in this stage.

---

### Stage 3 — Panel UI

**Scope:** Vue views and components consuming the Stage 2 API.

**Order within this stage:**
1. `Categories.vue`, `Tags.vue`, `Authors.vue` — list/create/edit/delete, confirmation modals with typed-word confirmation, usage-count display, category reassignment flow
2. `PostEditor.vue` — Markdown split-view/new-tab preview, cover image + alt requirement, translation-link selector, category-mismatch warning
3. Posts list view — untranslated-post indicator
4. Global confirmation modal component, reused across all destructive actions per the monorepo's typed-confirmation rule

**After each sub-step, verify the corresponding Gherkin scenario(s) manually against the running panel.**

---

### Stage 4 — Documentation

**Scope:** Complete all documentation. No code changes.

**Deliverables:**
- `panel/spec.md` — finalize decisions log
- `panel/claude.md` — panel-specific Claude Code instructions
- `panel/readme.md` — local dev setup (frontend + backend), including how `BLOG_CONTENT_PATH`/`BLOG_CONFIG_PATH` must point at a local `blog/frontend` checkout

---

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-03 | Panel writes raw Markdown + frontmatter directly (Content Collections Option A); the panel's Markdown preview is a separate, approximate renderer | Avoids two divergent HTML pipelines; the panel's preview only needs to be good enough for authoring feedback, not byte-identical to the published output |
| 2026-07-03 | Category and Author deletion blocked while referenced; Tag deletion always allowed with cascading reference removal | Category and Author are single-value, mandatory post fields — a post cannot be left without either. Tags are multi-value and optional, so blocking their deletion would make long-term tag cleanup impractical |
| 2026-07-03 | Tags are created only from the Tags view, never inline from the post editor | Prevents tag catalog fragmentation from typos or near-duplicate tags created ad hoc while writing a post |
| 2026-07-03 | Translation linking uses a `translationId` selector filtered to posts missing the target language, rather than free-text ID entry | Removes the error-prone step of manually copying/typing an ID; guarantees the link always points at a real, currently-existing post |
| 2026-07-03 | Category mismatch between linked translations is a non-blocking warning in the panel, but a hard CI error in `blog/spec.md` | The panel should not stop the developer's flow for something recoverable and possibly intentional in-progress; CI is the enforced final gate before anything ships |
| 2026-07-03 | All destructive actions (category, author, tag deletion) require typing the literal confirmation word before executing | There is no undo and no transaction log behind direct filesystem writes; a single misclick should never be able to delete data |
| 2026-07-03 | `panel/backend` validation functions return a discriminated `{ ok: true; ... } \| { ok: false; error }` result shape | Makes success/failure explicit and type-narrowable in TypeScript, consistent with the same pattern already used in the `arcade` monorepo's validation layer |
| 2026-07-03 | Cover image + non-empty alt text is a hard publish gate in the panel UI, mirroring the CI-level schema requirement in `blog/spec.md` | Catches the omission at authoring time rather than letting a failed CI build be the first signal |
| 2026-07-06 | (Stage 1) Backend tests are TypeScript run on Node's native TS execution (`node --test` over `.ts`), with zero test dependencies | Matches the blog's dependency-frugal, built-in-runner approach; keeps the integrity core testable without a build step or a test framework |
| 2026-07-06 | (Stage 1) A panel-local `postFrontmatterSchema` (zod) mirrors the canonical Domain Model instead of importing the blog's schema | The blog's `content.config.ts` imports the build-only `astro:content` virtual module and cannot be loaded from plain Node; the panel keeps its own copy and both must be updated together on any Domain Model change |
| 2026-07-06 | (Stage 1) The integrity checks are pure functions over in-memory snapshots; shared types live in `lib/types.ts` | Keeps write-time validation unit-testable without the filesystem or HTTP; Stage 2 routes own the real content loading and wire these to `fsWriter.ts`. Atomic writes use temp-file + rename with a `beforeRename` test seam, and path segments are pattern-validated to block traversal |
| 2026-07-06 | (Stage 2) The server is `node:http` + a ~90-line custom router (`lib/router.ts`), no web framework; route tests boot it on an ephemeral loopback port and exercise it with real `fetch` | Keeps the local-only backend dependency-frugal (consistent with the blog); the router covers exactly the small route table. Real-HTTP tests exercise the full request pipeline, not just handlers |
| 2026-07-06 | (Stage 2) A single `lib/store.ts` is the only content I/O layer; every mutation runs through `integrity.ts` then persists via `fsWriter.ts`. Post id in routes is `"{lang}:{slug}"` | Centralizes reading current content, building the `ContentSnapshot`, and cascading tag removal, so routes stay thin. `{lang}:{slug}` is a single URL-safe path segment (posts have no standalone id). Supporting files (`config.ts`, `server.ts`, `main.ts`, `router.ts`, `store.ts`) accompany the spec's named `routes/*.ts` |
| 2026-07-06 | (Stage 2) `BLOG_CONTENT_PATH` = `blog/frontend/src/content` (posts + taxonomy collections); `BLOG_CONFIG_PATH` = `blog/frontend/src` (site config) | The Domain Model places categories/tags/authors under `src/content`, and `site.config.json` under `src`; this resolves the slightly ambiguous env-var descriptions to match the blog's actual on-disk layout. Documented in `.env.example` |
| 2026-07-06 | (Stage 3) The panel UI is Vue 3 + Vite; navigation is reactive view-switching state, not `vue-router` | A single-user local tool with four content areas plus the editor needs no URL routing; a reactive `view` ref keeps it dependency-light |
| 2026-07-06 | (Stage 3) The Markdown preview renders with `markdown-it` (`html: false`) inside a sandboxed `<iframe srcdoc>`; "open in new tab" uses a Blob URL | Satisfies the Security Contract (no `innerHTML`/`v-html`, no `eval`/`new Function`, no `document.write`): the rendered HTML lives in an isolated, script-less iframe, never injected into the app DOM. The preview is explicitly labelled approximate (Astro produces the published HTML) |
| 2026-07-06 | (Stage 3) The Vite dev server proxies `/api` to the backend (`PANEL_PORT`) | Same-origin requests avoid CORS and keep the backend origin out of source; the frontend never hardcodes a backend URL |
| 2026-07-06 | (Stage 3) A reusable `ConfirmModal` enforces the typed-word ("eliminar") gate for every delete, including posts; category/author deletes run a bulk-reassignment flow first; the tag-delete count is computed client-side from the posts list | One modal centralizes the monorepo's typed-confirmation rule. There is no tag-usage endpoint, so the count is derived from `GET /api/posts`. Reassignment updates each affected post via `PUT` before deletion is unblocked |
| 2026-07-10 | Scoped restyle: the panel UI was rebuilt to match a Claude-Design mockup (dark glass theme, `Sora`/`IBM Plex Sans`) delivered as a handoff bundle. Category/author/tag CRUD, the typed-`"eliminar"` delete gate, the reassignment flow, the category slug-change warning, and the post editor's translation-link selector were all kept and re-skinned — the mockup itself omitted or simplified each of these (e.g. Authors/Tags were read-only cards/chips with no delete confirmation in the mockup) | The mockup was a simplified prototype exported from a design tool, not a functional spec; the developer confirmed (asked via 4 clarifying questions before implementing) that every existing security/functionality behavior should be preserved and merely re-themed, not dropped to match the prototype |
| 2026-07-10 | Posts view gained client-side search (title/slug), language + category filters, and pagination (page size 6) — new relative to the original Stage 3 delivery | Directly requested by the mockup's design; implemented against the real `GET /api/posts` data (no backend change needed) rather than as mocked UI |
| 2026-07-10 | The panel computes and appends CloudFront invalidation paths on every post/category/tag/author write, to a shared manifest (`invalidation-manifest.txt`, repo root) consumed by `blog/spec.md`'s `compute-invalidation-paths.mjs` | Replaces `blog/`'s git-diff-based change detection, which could not see non-content (template/page) changes and required reconstructing deleted entities' prior state via `git show`. The panel already has the exact paths and the pre-deletion state in memory at write time |
| 2026-07-10 | `lib/invalidationPaths.ts` duplicates the route/wildcard-building logic that also exists in `blog/frontend/src/lib/routing.mjs`, rather than importing or extracting it to a shared package | Keeps `panel/` and `blog/` fully independent subprojects (no cross-subproject dependency has ever existed); this route-shape logic changes rarely, so the duplication cost is low next to the cost of introducing shared tooling/build wiring between two otherwise-independent packages |
| 2026-07-10 | Manifest de-duplication checks only the lines after the last cut marker (whole file if none exists), by exact string match | Matches the git-diff-replacement's accepted risk profile: over-invalidating (a rare duplicate slipping through) is harmless, so exact-match dedup is sufficient — no need for wildcard-subsumption logic (the design never emits both an exact and a wildcard form of the same listing) |
| 2026-07-10 | The publish cut (`POST /api/publish-cut` + a panel button) is a manual, developer-triggered action with no verification that a deploy actually succeeded | The panel has no visibility into GitHub Actions (it is local-only and git-unaware by design). A missed click only over-invalidates on the next publish — the same accepted worst case as manual manifest edits — so no verification mechanism is needed |
| 2026-07-11 | Bugfix: `postInvalidationPaths`'s own post entry now emits `/{lang}/{slug}/*` (was the bare `/{lang}/{slug}`); its home entry now emits `/{lang}/index.html` (was the bare `/{lang}/`) | Live invalidations were firing but not clearing the actual cached page — the edge CloudFront Function rewrites directory-style URIs to append `index.html` **before** the CloudFront cache lookup, so the cached object's real key is `.../index.html`, which a bare-path invalidation never matches. A wildcard suffix (matching every other per-entity path already in this module) fixes the post's own entry; home specifically needs the exact `index.html` suffix rather than a `/{lang}/*` wildcard, since that would invalidate every page under the language on every single publish. `T-MANIFEST-01`/`T-MANIFEST-02` updated to assert the corrected paths; the live `invalidation-manifest.txt`'s pending entries (posted before the fix) were hand-corrected to match. See `blog/spec.md`'s matching entry for the `alwaysInvalidatePaths` (home-only) side of the same fix |