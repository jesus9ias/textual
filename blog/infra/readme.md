# blog/infra

AWS infrastructure for the Textual blog, as a **single AWS CDK v2 stack** deployed
**from local only** (`cdk deploy`). It is never invoked by CI, and therefore the
CI role needs no CloudFormation/CDK permissions (see the monorepo CI/CD Contract).

## What this stack provisions

- **Two private S3 buckets** — `entries` (individual post pages, long TTL) and
  `shell` (home, listings, `sitemap.xml`/`rss.xml`/`robots.txt`, shared assets,
  short TTL). Both fully private; names are auto-generated, never hardcoded.
- **One Origin Access Control (OAC) per bucket** — the only principal granted
  read access to each bucket is the distribution.
- **One CloudFront distribution with two behaviors** — default behavior serves
  the `shell` origin; one additional behavior serves the `entries` origin.
- **A root-redirect CloudFront Function** on the default (shell) behavior: the
  exact URI `/` returns a `301` to `/{DEFAULT_LANG}/`. `DEFAULT_LANG` is baked in
  at synth time; the redirect never depends on any per-request signal.
- **DNS alias records** (A + AAAA) for the site domain, in the existing Route 53
  hosted zone (referenced, never created).

Everything deploys in **us-east-1** — CloudFront requires its ACM certificate
there, and none of the other resources are region-sensitive, so a single region
avoids any cross-region reference.

## Stage-1 design note: behavior routing (provisional)

The blog spec requires the root-redirect function on the **shell** behavior,
matching the exact `/`. For a viewer request to `/` to reach that function, the
behavior serving `/` must be the **default** behavior — so **shell is the default
behavior** and **entries is the additional behavior**.

The precise entries/shell path partition depends on the site's route shapes and
`supportedLangs`, which do not exist until **Stage 3**. Stage 1 therefore wires
exactly the two behaviors the deliverable calls for, using a **provisional**
entries path pattern derived from `DEFAULT_LANG` (`/{DEFAULT_LANG}/*`). Stage 3
finalizes this — adding per-language patterns and reserved-segment (`categoria`,
`tag`, `autor`, `historico`, `rss`) shell overrides. See the Decisions Log in
`blog/spec.md`.

Sub-path index resolution (appending `index.html` to directory-style URLs such
as `/es/`) is likewise a Stage-3 concern; Stage 1 ships only the root-redirect
function.

## Prerequisites

- Node.js 20+ and npm
- AWS credentials with permission to deploy the stack (from local)
- An existing Route 53 hosted zone for `DOMAIN_NAME`
- An ACM certificate in `us-east-1` covering the site domain

## Setup

```bash
cd blog/infra
npm install
cp .env.example .env   # then fill in every value
```

See `.env.example` for each variable. `.env` is git-ignored and is the only
place environment-specific values live.

## Commands

```bash
npm run typecheck   # tsc --noEmit — the Stage-1 automated gate
npm run synth       # cdk synth — render the CloudFormation template
npm run diff        # cdk diff — preview changes against the deployed stack
npm run deploy      # cdk deploy — deploy from local
```

If you use a named profile, set `AWS_PROFILE` in `.env` or pass
`--profile <name>` to the `cdk` commands.

## Deploying multiple stacks (per subdomain / fork)

The whole stack is named from `STACK_NAME` in `.env`. That name becomes the
CloudFormation stack name **and** the prefix of every auto-generated resource
name, so you can deploy the same project as several independent stacks — each
with its own `STACK_NAME`, `SUBDOMAIN`, and `CERTIFICATE_ARN`.

```bash
# Stack A
STACK_NAME=textual-blog   SUBDOMAIN=blog  ... in .env  ->  npm run deploy
# Stack B (e.g. a fork running a different template, another subdomain)
STACK_NAME=textual-notes  SUBDOMAIN=notes ... in .env  ->  npm run deploy
```

Each stack gets its own buckets, distribution, and DNS records, and is tagged
`Project=<STACK_NAME>`. Use a different `SUBDOMAIN` per stack — nothing is shared
between them. `npx cdk ls` prints the current stack's name; `cdk` commands act on
the stack defined by the current `.env`.

## Post-deploy verification (Stage 1)

1. Confirm both buckets, both OACs, the distribution, and the root-redirect
   function exist.
2. Manually verify the redirect:
   ```bash
   curl -sI https://<site-domain>/ | grep -i -E 'HTTP/|location'
   ```
   Expect `HTTP/2 301` and `location: /<DEFAULT_LANG>/`.
3. Confirm deep links and root-level static file paths are **not** redirected
   (they will 403/404 until content is deployed in a later stage, but they must
   not return a 301).

## Outputs

After deploy, the stack prints `EntriesBucketName`, `ShellBucketName`,
`DistributionId`, `DistributionDomainName`, and `SiteDomain`. The bucket names
and distribution id are what the content pipeline consumes as GitHub Actions
secrets (`ENTRIES_BUCKET_NAME`, `SHELL_BUCKET_NAME`,
`CLOUDFRONT_DISTRIBUTION_ID`) — never hardcoded in the workflow.
