/**
 * CloudFront Function that redirects the bare domain root to the default
 * language home. It is attached to the `shell` behavior's viewer-request event
 * and matches ONLY the exact URI `/`, returning a deterministic 301 to
 * `/{DEFAULT_LANG}/`. The target language is interpolated at CDK synth time
 * from `DEFAULT_LANG` in `.env` — it is never read from any per-request signal
 * (Accept-Language, geo, etc.), so every visitor and crawler is redirected
 * identically. Deep links and root-level static files (`/sitemap.xml`,
 * `/robots.txt`) pass through unmodified.
 *
 * See monorepo spec "i18n & SEO Contract" and blog spec Gherkin
 * "Feature: Root URL redirect".
 */
import { Construct } from 'constructs';
import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';
import {
  CF_FUNCTION_RUNTIME,
  HTTP_STATUS_MOVED_PERMANENTLY,
  MOVED_PERMANENTLY_DESCRIPTION,
  ROOT_URI,
} from '../constants';

export interface RootRedirectFunctionProps {
  /** The default language code, baked into the function source at synth time. */
  readonly defaultLang: string;
}

/** Builds the CloudFront Function source with `defaultLang` interpolated in. */
function renderFunctionCode(defaultLang: string): string {
  const target = `/${defaultLang}/`;
  return [
    'function handler(event) {',
    '  var request = event.request;',
    `  if (request.uri === '${ROOT_URI}') {`,
    '    return {',
    `      statusCode: ${HTTP_STATUS_MOVED_PERMANENTLY},`,
    `      statusDescription: '${MOVED_PERMANENTLY_DESCRIPTION}',`,
    `      headers: { location: { value: '${target}' } }`,
    '    };',
    '  }',
    '  return request;',
    '}',
  ].join('\n');
}

export class RootRedirectFunction extends Construct {
  public readonly function: cloudfront.Function;

  constructor(scope: Construct, id: string, props: RootRedirectFunctionProps) {
    super(scope, id);

    this.function = new cloudfront.Function(this, 'Function', {
      runtime: CF_FUNCTION_RUNTIME,
      comment: `Root redirect: ${ROOT_URI} -> /${props.defaultLang}/ (301)`,
      code: cloudfront.FunctionCode.fromInline(renderFunctionCode(props.defaultLang)),
    });
  }
}
