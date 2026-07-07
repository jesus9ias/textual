/**
 * Central declaration of every non-environment-specific constant used by the
 * blog infrastructure stack. Per the monorepo working discipline ("No magic
 * values"), no literal constant is inlined at its point of use — it is declared
 * here and imported. Environment-specific values (domain, account, ARNs, etc.)
 * do NOT live here; they live in `.env` and are surfaced through `env.ts`.
 */
import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';

/**
 * The single region the entire stack deploys to. CloudFront requires its ACM
 * certificate in `us-east-1`; none of the stack's other resources are
 * region-sensitive, so deploying the whole stack here avoids any cross-region
 * reference (see monorepo Decisions Log, 2026-07-06). `env.ts` validates that
 * the `.env` `AWS_REGION` matches this value.
 */
export const STACK_REGION = 'us-east-1';

/** Stack-level tag key stamped with the stack name, for identifying/​grouping resources. */
export const PROJECT_TAG_KEY = 'Project';

/** Edge CloudFront Function contract: root redirect + directory-index rewrite. */
export const ROOT_URI = '/';
export const HTTP_STATUS_MOVED_PERMANENTLY = 301;
export const MOVED_PERMANENTLY_DESCRIPTION = 'Moved Permanently';
export const INDEX_DOCUMENT = 'index.html';

/**
 * CloudFront Function runtime. `JS_2_0` is the current CloudFront Functions
 * JavaScript runtime.
 */
export const CF_FUNCTION_RUNTIME = cloudfront.FunctionRuntime.JS_2_0;

/** CloudFront price class. `ALL` keeps global edge coverage for SEO/performance. */
export const CLOUDFRONT_PRICE_CLASS = cloudfront.PriceClass.PRICE_CLASS_ALL;

/** Default root object; harmless since the exact `/` URI is redirected at the edge. */
export const DEFAULT_ROOT_OBJECT = 'index.html';

/** Stable logical construct ids (kept in one place to avoid drift on rename). */
export const CONSTRUCT_IDS = {
  staticSite: 'StaticSite',
  edgeFunction: 'EdgeFunction',
  siteBucket: 'SiteBucket',
  distribution: 'Distribution',
  aliasRecord: 'AliasRecord',
  aliasRecordIpv6: 'AliasRecordIpv6',
  hostedZone: 'HostedZone',
  certificate: 'Certificate',
} as const;

/** CloudFormation output keys (consumed to populate GitHub Actions secrets). */
export const OUTPUT_KEYS = {
  siteBucketName: 'SiteBucketName',
  distributionId: 'DistributionId',
  distributionDomainName: 'DistributionDomainName',
  siteDomain: 'SiteDomain',
} as const;
