/**
 * Single point where environment-specific configuration is read and validated.
 * No other file reads `process.env` directly — this keeps every sensitive /
 * environment-specific value (domain, account id, hosted zone id, certificate
 * arn, default language) sourced exclusively from `.env`, per the monorepo
 * Security Contract, and fails fast with a readable message when misconfigured.
 */
import { STACK_REGION } from './constants';

export interface InfraEnv {
  /**
   * Name of the whole stack. Drives the CloudFormation stack name and therefore
   * the prefix of every auto-generated physical resource name — so the same
   * project can be deployed as multiple independent stacks (one per `.env`,
   * e.g. per subdomain / fork).
   */
  readonly stackName: string;
  readonly domainName: string;
  readonly subdomain: string | undefined;
  readonly hostedZoneId: string;
  readonly certificateArn: string;
  readonly defaultLang: string;
  readonly awsAccountId: string;
  readonly awsRegion: string;
  /** Full domain the distribution serves: `subdomain.domain` or bare `domain`. */
  readonly siteDomain: string;
}

/** Language code shape accepted for DEFAULT_LANG (e.g. `es`, `en`, `pt-br`). */
const LANG_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/;
const HOSTED_ZONE_ID_PATTERN = /^[A-Z0-9]+$/;
const AWS_ACCOUNT_ID_PATTERN = /^\d{12}$/;
/** CloudFormation stack-name rules: start with a letter, alphanumeric + hyphens, ≤128 chars. */
const STACK_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,127}$/;

class EnvError extends Error {}

function required(name: string, value: string | undefined, errors: string[]): string {
  if (value === undefined || value.trim() === '') {
    errors.push(`Missing required environment variable: ${name}`);
    return '';
  }
  return value.trim();
}

/**
 * Reads and validates the infra configuration from `process.env` (which the
 * entrypoint has already populated from `.env`). Accumulates every problem and
 * throws once, so a misconfigured `.env` reports all issues at once rather than
 * one per run.
 */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): InfraEnv {
  const errors: string[] = [];

  const stackName = required('STACK_NAME', env.STACK_NAME, errors);
  const domainName = required('DOMAIN_NAME', env.DOMAIN_NAME, errors);
  const subdomainRaw = env.SUBDOMAIN?.trim();
  const subdomain = subdomainRaw === undefined || subdomainRaw === '' ? undefined : subdomainRaw;
  const hostedZoneId = required('HOSTED_ZONE_ID', env.HOSTED_ZONE_ID, errors);
  const certificateArn = required('CERTIFICATE_ARN', env.CERTIFICATE_ARN, errors);
  const defaultLang = required('DEFAULT_LANG', env.DEFAULT_LANG, errors);
  const awsAccountId = required('AWS_ACCOUNT_ID', env.AWS_ACCOUNT_ID, errors);
  const awsRegion = required('AWS_REGION', env.AWS_REGION, errors);

  if (stackName !== '' && !STACK_NAME_PATTERN.test(stackName)) {
    errors.push(
      `STACK_NAME must start with a letter and contain only letters, digits and hyphens (≤128 chars); got "${stackName}"`,
    );
  }
  if (defaultLang !== '' && !LANG_PATTERN.test(defaultLang)) {
    errors.push(`DEFAULT_LANG must be a lowercase language code (e.g. "es"); got "${defaultLang}"`);
  }
  if (hostedZoneId !== '' && !HOSTED_ZONE_ID_PATTERN.test(hostedZoneId)) {
    errors.push(`HOSTED_ZONE_ID has an unexpected shape; got "${hostedZoneId}"`);
  }
  if (awsAccountId !== '' && !AWS_ACCOUNT_ID_PATTERN.test(awsAccountId)) {
    errors.push(`AWS_ACCOUNT_ID must be a 12-digit account id; got "${awsAccountId}"`);
  }
  if (awsRegion !== '' && awsRegion !== STACK_REGION) {
    errors.push(`AWS_REGION must be "${STACK_REGION}" (the entire stack deploys there); got "${awsRegion}"`);
  }

  if (errors.length > 0) {
    throw new EnvError(
      `Invalid blog/infra environment configuration:\n  - ${errors.join('\n  - ')}\n` +
        `Copy .env.example to .env and fill in every value before running cdk.`,
    );
  }

  const siteDomain = subdomain === undefined ? domainName : `${subdomain}.${domainName}`;

  return {
    stackName,
    domainName,
    subdomain,
    hostedZoneId,
    certificateArn,
    defaultLang,
    awsAccountId,
    awsRegion,
    siteDomain,
  };
}
