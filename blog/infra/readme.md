# blog/infra

AWS infrastructure for the Textual blog, as a **single AWS CDK v2 stack** deployed
**from local only** (`cdk deploy`). It is never invoked by CI, and therefore the
CI role needs no CloudFormation/CDK permissions (see the monorepo CI/CD Contract).

## What this stack provisions

- **One private S3 bucket** holding the whole built site (post pages, home,
  listings, `sitemap.xml`/`rss.xml`/`robots.txt`, shared assets). Fully private;
  the name is auto-generated (never hardcoded) and prefixed with the stack name.
- **One Origin Access Control (OAC)** — the only principal granted read access to
  the bucket is the distribution.
- **One CloudFront distribution with a single behavior** over the bucket. TTL
  differentiation is done with per-object `Cache-Control` at publish time
  (immutable assets long, HTML short), not a bucket split.
- **An edge CloudFront Function** on the behavior that (a) returns a `301` from
  the exact URI `/` to `/{DEFAULT_LANG}/` (baked in at synth time, never from a
  per-request signal), and (b) rewrites directory-style URIs to append
  `index.html` so clean URLs (`/es/`, `/en/how-black-holes-form`) resolve against
  the S3 REST origin — which does not append `index.html` on its own.
- **DNS alias records** (A + AAAA) for the site domain, in the existing Route 53
  hosted zone (referenced, never created).

Everything deploys in **us-east-1** — CloudFront requires its ACM certificate
there, and none of the other resources are region-sensitive, so a single region
avoids any cross-region reference.

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

## Post-deploy verification

1. Confirm the bucket, the OAC, the distribution, and the edge function exist.
2. Manually verify the redirect:
   ```bash
   curl -sI https://<site-domain>/ | grep -i -E 'HTTP/|location'
   ```
   Expect `HTTP/2 301` and `location: /<DEFAULT_LANG>/`.
3. Once content is published, confirm clean URLs resolve (the edge function
   appends `index.html`):
   ```bash
   curl -sI https://<site-domain>/es/ | grep -i 'HTTP/'          # 200
   curl -sI https://<site-domain>/en/how-black-holes-form | grep -i 'HTTP/'   # 200
   ```

## Outputs

After deploy, the stack prints `SiteBucketName`, `DistributionId`,
`DistributionDomainName`, and `SiteDomain`. The bucket name and distribution id
are what the content pipeline consumes as GitHub Actions secrets
(`SITE_BUCKET_NAME`, `CLOUDFRONT_DISTRIBUTION_ID`) — never hardcoded in the
workflow.
