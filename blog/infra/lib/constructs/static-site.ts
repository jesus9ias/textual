/**
 * The blog's hosting surface: two private S3 buckets (`entries` and `shell`),
 * each fronted by its own Origin Access Control (OAC), behind a single
 * CloudFront distribution with two behaviors.
 *
 * Behavior routing (see Stage-1 design note in `readme.md`):
 *   - default behavior  -> `shell` origin, carries the root-redirect function
 *   - additional behavior -> `entries` origin (provisional path pattern,
 *     finalized in Stage 3)
 *
 * Both buckets are fully private; the only principal granted read access is the
 * distribution, via the per-bucket OAC that `S3BucketOrigin.withOriginAccessControl`
 * provisions and wires into each bucket policy.
 */
import { Construct } from 'constructs';
import {
  RemovalPolicy,
  Stack,
  aws_s3 as s3,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_certificatemanager as acm,
} from 'aws-cdk-lib';
import {
  CONSTRUCT_IDS,
  CLOUDFRONT_PRICE_CLASS,
  DEFAULT_ROOT_OBJECT,
  ENTRIES_CACHE_DEFAULT_TTL,
  ENTRIES_CACHE_MAX_TTL,
  ENTRIES_CACHE_MIN_TTL,
  SHELL_CACHE_DEFAULT_TTL,
  SHELL_CACHE_MAX_TTL,
  SHELL_CACHE_MIN_TTL,
  entriesPathPattern,
} from '../constants';
import { RootRedirectFunction } from './root-redirect-function';

export interface StaticSiteProps {
  /** Fully-qualified domain the distribution serves (e.g. `blog.example.com`). */
  readonly siteDomain: string;
  /** ACM certificate (must live in us-east-1) referenced by ARN. */
  readonly certificate: acm.ICertificate;
  /** Default language, used to build the root redirect and the provisional entries pattern. */
  readonly defaultLang: string;
}

export class StaticSite extends Construct {
  public readonly entriesBucket: s3.Bucket;
  public readonly shellBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id);

    // --- Buckets -----------------------------------------------------------
    // Names are intentionally auto-generated (never hardcoded): the repository
    // is public and bucket names are globally unique + environment-specific.
    // The generated names are surfaced as stack outputs to populate the
    // GitHub Actions secrets used by the content pipeline.
    const bucketProps: s3.BucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      publicReadAccess: false,
      // RETAIN protects published output from accidental deletion on stack
      // teardown; the source of truth remains the git repository.
      removalPolicy: RemovalPolicy.RETAIN,
    };
    this.entriesBucket = new s3.Bucket(this, CONSTRUCT_IDS.entriesBucket, bucketProps);
    this.shellBucket = new s3.Bucket(this, CONSTRUCT_IDS.shellBucket, bucketProps);

    // --- Origins (one OAC per bucket) --------------------------------------
    const entriesOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.entriesBucket);
    const shellOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.shellBucket);

    // --- Cache policies (split TTLs per the two-bucket decision) ------------
    const entriesCachePolicy = new cloudfront.CachePolicy(this, CONSTRUCT_IDS.entriesCachePolicy, {
      defaultTtl: ENTRIES_CACHE_DEFAULT_TTL,
      maxTtl: ENTRIES_CACHE_MAX_TTL,
      minTtl: ENTRIES_CACHE_MIN_TTL,
    });
    const shellCachePolicy = new cloudfront.CachePolicy(this, CONSTRUCT_IDS.shellCachePolicy, {
      defaultTtl: SHELL_CACHE_DEFAULT_TTL,
      maxTtl: SHELL_CACHE_MAX_TTL,
      minTtl: SHELL_CACHE_MIN_TTL,
    });

    // --- Root redirect (attached to the shell/default behavior) ------------
    const rootRedirect = new RootRedirectFunction(this, CONSTRUCT_IDS.rootRedirectFunction, {
      defaultLang: props.defaultLang,
    });

    // --- Distribution ------------------------------------------------------
    this.distribution = new cloudfront.Distribution(this, CONSTRUCT_IDS.distribution, {
      comment: `${Stack.of(this).stackName} — ${props.siteDomain}`,
      domainNames: [props.siteDomain],
      certificate: props.certificate,
      priceClass: CLOUDFRONT_PRICE_CLASS,
      defaultRootObject: DEFAULT_ROOT_OBJECT,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // Default behavior = shell. The root-redirect function must sit on the
      // behavior that serves the exact `/` URI, which is the default behavior.
      defaultBehavior: {
        origin: shellOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: shellCachePolicy,
        functionAssociations: [
          {
            function: rootRedirect.function,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        [entriesPathPattern(props.defaultLang)]: {
          origin: entriesOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: entriesCachePolicy,
        },
      },
    });
  }
}
