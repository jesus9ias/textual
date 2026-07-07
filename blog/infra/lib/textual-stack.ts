/**
 * The single CloudFormation stack for the blog's infrastructure, deployed
 * entirely in us-east-1. It references (never creates) the existing Route 53
 * hosted zone and the ACM certificate, provisions the static hosting surface
 * (`StaticSite`), and creates the DNS alias records pointing the site domain at
 * the CloudFront distribution.
 */
import { Construct } from 'constructs';
import {
  Stack,
  StackProps,
  CfnOutput,
  aws_certificatemanager as acm,
  aws_route53 as route53,
  aws_route53_targets as targets,
} from 'aws-cdk-lib';
import { CONSTRUCT_IDS, OUTPUT_KEYS } from './constants';
import type { InfraEnv } from './env';
import { StaticSite } from './constructs/static-site';

export interface TextualStackProps extends StackProps {
  readonly config: InfraEnv;
}

export class TextualStack extends Stack {
  constructor(scope: Construct, id: string, props: TextualStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Referenced, never created.
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, CONSTRUCT_IDS.hostedZone, {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.domainName,
    });
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      CONSTRUCT_IDS.certificate,
      config.certificateArn,
    );

    const site = new StaticSite(this, CONSTRUCT_IDS.staticSite, {
      siteDomain: config.siteDomain,
      certificate,
      defaultLang: config.defaultLang,
    });

    // DNS alias records (A + AAAA) for the site domain -> distribution.
    const recordTarget = route53.RecordTarget.fromAlias(
      new targets.CloudFrontTarget(site.distribution),
    );
    new route53.ARecord(this, CONSTRUCT_IDS.aliasRecord, {
      zone: hostedZone,
      recordName: config.siteDomain,
      target: recordTarget,
    });
    new route53.AaaaRecord(this, CONSTRUCT_IDS.aliasRecordIpv6, {
      zone: hostedZone,
      recordName: config.siteDomain,
      target: recordTarget,
    });

    // Outputs consumed to populate GitHub Actions secrets (bucket names,
    // distribution id) — never hardcoded in the workflow.
    new CfnOutput(this, OUTPUT_KEYS.entriesBucketName, {
      value: site.entriesBucket.bucketName,
      description: 'S3 bucket for individual post pages (entries).',
    });
    new CfnOutput(this, OUTPUT_KEYS.shellBucketName, {
      value: site.shellBucket.bucketName,
      description: 'S3 bucket for home, listings, sitemap/rss/robots and shared assets (shell).',
    });
    new CfnOutput(this, OUTPUT_KEYS.distributionId, {
      value: site.distribution.distributionId,
      description: 'CloudFront distribution id (target of CI invalidations).',
    });
    new CfnOutput(this, OUTPUT_KEYS.distributionDomainName, {
      value: site.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name.',
    });
    new CfnOutput(this, OUTPUT_KEYS.siteDomain, {
      value: config.siteDomain,
      description: 'Public site domain served by the distribution.',
    });
  }
}
