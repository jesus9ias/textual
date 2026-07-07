# Claude Code — working instructions for `blog/`

Read `../spec.md` (monorepo contract) and `./spec.md` (blog contract) before acting on any
prompt. Those are the source of truth; this file only summarizes the working rules and the
non-obvious conventions already in place. In any conflict, the specs win — and the monorepo
spec wins over the blog spec.

## Working discipline (blog-specific reminders)

- **Spec-first & stage discipline.** Every feature traces to a Gherkin scenario. Stages run in
  order; stop and wait for authorization between them. Stages 1–5 are delivered (see the blog
  spec "Delivery status"); further changes are scoped work, not new stages, unless the developer
  says so.
- **TDD gate.** Tests and their definitions (`T-VAL-*`, `T-I18N-*`, `T-DIFF-*` in the blog spec)
  are not created or modified without explicit developer authorization. Write/adjust tests first,
  see them fail, then implement.
- **Conflict detection.** If a change contradicts a spec or a prior Decisions Log entry, stop,
  alert the developer, and — only if confirmed — update the documentation first, then the code.
  Two such conflicts already happened and were resolved this way (the `glob()` loader migration
  and the `validate-integrity` raw-file loader).
- **No magic values.** Constants live in dedicated modules: route segments / page size /
  wildcards in `frontend/src/lib/routing.mjs`; infra constants in `infra/lib/constants.ts`;
  rule codes in `frontend/scripts/validate-integrity.mjs`.
- **English everywhere** in code/comments/docs. User-visible UI text lives ONLY in the i18n
  layer (`frontend/src/i18n/ui.mjs`), never inlined in components. Content strings come from the
  content collections.
- **Environment-specific values live in `.env` only** — never hardcode a domain, account id,
  hosted zone id, certificate ARN, bucket name, distribution id, or site URL.

## Architecture conventions already established

- **Content model (Astro 5 Content Layer).** `frontend/src/content.config.ts` uses `glob()`
  loaders (not legacy `type: 'content'/'data'`), because `slug` is reserved in classic content
  collections. The Zod schema is the canonical Domain Model; keep it in sync with both specs.
- **Pure logic is `.mjs` with JSDoc**, so it is importable by Astro AND runnable under Node's
  built-in test runner with zero deps: `routing.mjs`, `hreflang.mjs`, `i18n/ui.mjs`, and the CI
  scripts. Astro-only code (uses `astro:content`, `import.meta.glob`, `import.meta.env`) is `.ts`
  or `.astro`: `content.ts`, `site.ts`, `images.ts`.
- **i18n routing is explicit `[lang]`** (`src/pages/[lang]/...`), never Astro's i18n config — the
  default language is never special-cased. The bare root `/` is not built; it is redirected at
  the edge by the infra CloudFront Function.
- **The language switcher is page-aware and decoupled from `hreflang`.** Each page passes a
  `langSwitch` (lang → URL) to `Base`/`Menu`. Posts link to the sibling post via `translationId`
  when it exists, else to that language's home (the toggle is never a dead end); the `hreflang`
  alternate stays strictly omitted for missing translations. Home and listings use
  `paginatedLangSwitch` to link the equivalent page (same page number), falling back to the
  language home. The switcher never transforms the current slug.
- **Cover images** are referenced in frontmatter as `/assets/posts/{translationId}/cover.jpg`,
  which physically lives under `src/assets/...`; `src/lib/images.ts` maps `"/assets/..."` →
  `"/src/assets/..."` so covers go through Astro's `<Image>`. The `defaultCoverImage` lives under
  `public/` and is a listing-only fallback.
- **The active template is env-driven.** `PUBLIC_TEMPLATE` (`blog/frontend/.env`, build-time,
  default `default`) selects the template under `src/templates/`. Page entry points resolve their
  layouts/widgets through `src/lib/template.ts` (`layout()` / `widget()` / `categoryLayout()`,
  backed by `import.meta.glob` over `src/templates/*`) — never hardcode a template folder in a page
  import. Components inside a template import each other relatively, so they stay self-contained.
- **Category-specific layouts** are resolved at build time from `post.data.categoryId` via
  `categoryLayout()`, falling back to the template's `Post` layout. The chosen layout is observable
  as `data-layout` in the output.
- **SEO surfaces are mandatory deliverables**: `sitemap.xml.ts` and `robots.txt.ts` at the true
  root; `[lang]/rss.xml.ts` one feed per language; `hreflang` alternates from `hreflang.mjs`.

## CI scripts (the two-parser rule)

- **`validate-integrity.mjs`** — pure `runIntegrityChecks(collections)` (tested) + a CLI loader
  that reads committed files via the shared `scripts/lib/content-reader.mjs`. It runs as a
  standalone Node step because `astro:content` is build-only and not importable from plain Node.
- **`detect-changed-views.mjs`** — pure `computeChangedViews(changes)` (tested) + a **git-based**
  wrapper (`git diff`/`git show`) that needs prior file versions Astro cannot provide. Paginated
  aggregators are invalidated with wildcards; single pages exactly.
- Both CI scripts share ONE raw reader (`content-reader.mjs` / `frontmatter.mjs`) — one parser,
  not two. Do not reintroduce a second parser.

## Verifying changes

- Tests: `cd blog/frontend && npm test` (Node's runner; `T-VAL-*`, `T-I18N-*`, `T-DIFF-*`).
- Content gate: `node scripts/validate-integrity.mjs` (runs standalone).
- Site: `npx astro sync && npx astro build`; inspect `dist/` to confirm Gherkin expectations.
- Infra: `cd blog/infra && npm run typecheck && npm run synth`. `cdk deploy` is developer-only.
- Hosting is a **single** S3 bucket + one CloudFront behavior; an edge function does the root
  redirect **and** appends `index.html` for directory URLs. TTL differentiation is per-object
  `Cache-Control` at publish time (no bucket split). The workflow does one `aws s3 sync` to
  `SITE_BUCKET_NAME`. (The earlier two-bucket `entries`/`shell` design was superseded — see the
  Decisions Log.)
