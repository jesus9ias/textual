/**
 * CloudFront Function (viewer-request) attached to the single site behavior. It
 * does two things at the edge, before the S3 origin is hit:
 *
 *  1. Root redirect — the exact URI `/` returns a deterministic 301 to
 *     `/{DEFAULT_LANG}/` (baked in at synth time from `DEFAULT_LANG`, never from
 *     a per-request signal).
 *  2. Directory-index rewrite — a directory-style request (ends with `/`, or has
 *     no file extension in its last segment) is rewritten to append
 *     `index.html`, so clean URLs like `/es/` and `/en/how-black-holes-form`
 *     resolve to the object S3 actually stores (`…/index.html`). Without this,
 *     an S3 REST origin returns AccessDenied for directory paths.
 *
 * Files with an extension (`/sitemap.xml`, `/robots.txt`, `/es/rss.xml`,
 * `/_astro/*.css`) pass through unchanged.
 */
import { Construct } from 'constructs';
import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';
import {
  CF_FUNCTION_RUNTIME,
  HTTP_STATUS_MOVED_PERMANENTLY,
  INDEX_DOCUMENT,
  MOVED_PERMANENTLY_DESCRIPTION,
  ROOT_URI,
} from '../constants';

export interface EdgeFunctionProps {
  /** Default language code, baked into the root redirect at synth time. */
  readonly defaultLang: string;
}

/** Builds the CloudFront Function source with `defaultLang` interpolated in. */
function renderFunctionCode(defaultLang: string): string {
  const redirectTarget = `/${defaultLang}/`;
  return [
    'function handler(event) {',
    '  var request = event.request;',
    '  var uri = request.uri;',
    `  if (uri === '${ROOT_URI}') {`,
    '    return {',
    `      statusCode: ${HTTP_STATUS_MOVED_PERMANENTLY},`,
    `      statusDescription: '${MOVED_PERMANENTLY_DESCRIPTION}',`,
    `      headers: { location: { value: '${redirectTarget}' } }`,
    '    };',
    '  }',
    "  if (uri.charAt(uri.length - 1) === '/') {",
    `    request.uri = uri + '${INDEX_DOCUMENT}';`,
    "  } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {",
    `    request.uri = uri + '/${INDEX_DOCUMENT}';`,
    '  }',
    '  return request;',
    '}',
  ].join('\n');
}

export class EdgeFunction extends Construct {
  public readonly function: cloudfront.Function;

  constructor(scope: Construct, id: string, props: EdgeFunctionProps) {
    super(scope, id);

    this.function = new cloudfront.Function(this, 'Function', {
      runtime: CF_FUNCTION_RUNTIME,
      comment: `Root redirect ${ROOT_URI} -> /${props.defaultLang}/ + directory index rewrite`,
      code: cloudfront.FunctionCode.fromInline(renderFunctionCode(props.defaultLang)),
    });
  }
}
