/**
 * The blog's hosting surface: a single private S3 bucket fronted by one Origin
 * Access Control (OAC), behind a single CloudFront distribution with one
 * behavior. The whole site (post pages, home, listings, sitemap/rss/robots,
 * shared assets) lives in the one bucket; an edge function handles the root
 * redirect and directory-index rewriting.
 *
 * The bucket is fully private; the only principal granted read access is the
 * distribution, via the OAC that `S3BucketOrigin.withOriginAccessControl`
 * provisions and wires into the bucket policy.
 *
 * TTL differentiation (immutable hashed assets vs. short-lived HTML) is applied
 * at publish time via `Cache-Control` headers on the synced objects — the
 * CachingOptimized policy honors origin `Cache-Control` — so it needs no
 * bucket/behavior split.
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
import { CONSTRUCT_IDS, CLOUDFRONT_PRICE_CLASS, DEFAULT_ROOT_OBJECT } from '../constants';
import { EdgeFunction } from './edge-function';

export interface StaticSiteProps {
  /** Fully-qualified domain the distribution serves (e.g. `blog.example.com`). */
  readonly siteDomain: string;
  /** ACM certificate (must live in us-east-1) referenced by ARN. */
  readonly certificate: acm.ICertificate;
  /** Default language, used to build the root redirect. */
  readonly defaultLang: string;
}

export class StaticSite extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id);

    // The name is auto-generated (never hardcoded): the repository is public and
    // bucket names are globally unique + environment-specific. The generated
    // name embeds the stack name as its prefix and is surfaced as a stack output
    // to populate the GitHub Actions secret used by the content pipeline.
    this.bucket = new s3.Bucket(this, CONSTRUCT_IDS.siteBucket, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      publicReadAccess: false,
      // RETAIN protects published output on stack teardown; the source of truth
      // is the git repository.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const origin = origins.S3BucketOrigin.withOriginAccessControl(this.bucket);

    const edge = new EdgeFunction(this, CONSTRUCT_IDS.edgeFunction, {
      defaultLang: props.defaultLang,
    });

    this.distribution = new cloudfront.Distribution(this, CONSTRUCT_IDS.distribution, {
      comment: `${Stack.of(this).stackName} — ${props.siteDomain}`,
      domainNames: [props.siteDomain],
      certificate: props.certificate,
      priceClass: CLOUDFRONT_PRICE_CLASS,
      defaultRootObject: DEFAULT_ROOT_OBJECT,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // Honors origin Cache-Control, so per-object TTLs (set at publish time)
        // are respected without a bucket/behavior split.
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: edge.function,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });
  }
}
