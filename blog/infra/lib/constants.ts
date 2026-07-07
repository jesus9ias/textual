/**
 * Central declaration of every non-environment-specific constant used by the
 * blog infrastructure stack. Per the monorepo working discipline ("No magic
 * values"), no literal constant is inlined at its point of use — it is declared
 * here and imported. Environment-specific values (domain, account, ARNs, etc.)
 * do NOT live here; they live in `.env` and are surfaced through `env.ts`.
 */
import { Duration, aws_cloudfront as cloudfront } from 'aws-cdk-lib';

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

/** Root-redirect CloudFront Function contract. */
export const ROOT_URI = '/';
export const HTTP_STATUS_MOVED_PERMANENTLY = 301;
export const MOVED_PERMANENTLY_DESCRIPTION = 'Moved Permanently';

/**
 * CloudFront Function runtime. `JS_2_0` is the current CloudFront Functions
 * JavaScript runtime.
 */
export const CF_FUNCTION_RUNTIME = cloudfront.FunctionRuntime.JS_2_0;

/**
 * Cache behavior tuning. The two buckets deliberately carry different TTLs
 * (monorepo Decisions Log, 2026-07-03): `entries` objects are near-immutable
 * once published (long TTL, invalidated only for the specific post that
 * changed); the `shell` changes on every publish (short TTL / explicit
 * invalidation).
 */
export const ENTRIES_CACHE_DEFAULT_TTL = Duration.days(365);
export const ENTRIES_CACHE_MAX_TTL = Duration.days(365);
export const ENTRIES_CACHE_MIN_TTL = Duration.seconds(0);

export const SHELL_CACHE_DEFAULT_TTL = Duration.minutes(5);
export const SHELL_CACHE_MAX_TTL = Duration.hours(1);
export const SHELL_CACHE_MIN_TTL = Duration.seconds(0);

/** CloudFront price class. `ALL` keeps global edge coverage for SEO/performance. */
export const CLOUDFRONT_PRICE_CLASS = cloudfront.PriceClass.PRICE_CLASS_ALL;

/** Default root object; harmless since the exact `/` URI is redirected at the edge. */
export const DEFAULT_ROOT_OBJECT = 'index.html';

/**
 * Provisional path pattern for the `entries` behavior.
 *
 * STAGE-1 SCOPE NOTE: The final entries/shell path partition depends on the
 * site's route shapes and `supportedLangs`, neither of which exists until
 * Stage 3. Stage 1 wires exactly the two behaviors the deliverable requires
 * (shell = default, entries = one additional behavior); this template produces
 * a provisional per-default-language pattern (`/{DEFAULT_LANG}/*`). It is
 * finalized in Stage 3 once the real routes and language set are defined, at
 * which point reserved aggregator segments (categoria/tag/autor/historico/rss)
 * become shell overrides. Documented in `readme.md` and the Decisions Log.
 */
export const entriesPathPattern = (defaultLang: string): string => `/${defaultLang}/*`;

/** Stable logical construct ids (kept in one place to avoid drift on rename). */
export const CONSTRUCT_IDS = {
  staticSite: 'StaticSite',
  rootRedirectFunction: 'RootRedirect',
  entriesBucket: 'EntriesBucket',
  shellBucket: 'ShellBucket',
  distribution: 'Distribution',
  entriesCachePolicy: 'EntriesCachePolicy',
  shellCachePolicy: 'ShellCachePolicy',
  aliasRecord: 'AliasRecord',
  aliasRecordIpv6: 'AliasRecordIpv6',
  hostedZone: 'HostedZone',
  certificate: 'Certificate',
} as const;

/** CloudFormation output keys (consumed to populate GitHub Actions secrets). */
export const OUTPUT_KEYS = {
  entriesBucketName: 'EntriesBucketName',
  shellBucketName: 'ShellBucketName',
  distributionId: 'DistributionId',
  distributionDomainName: 'DistributionDomainName',
  siteDomain: 'SiteDomain',
} as const;
