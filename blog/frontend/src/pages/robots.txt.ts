/**
 * robots.txt at the true root path. Generated (not static) so it can reference
 * the env-sourced site URL for the sitemap location.
 */
import type { APIRoute } from 'astro';
import { siteUrl } from '../lib/site';
import { absoluteUrl, ROOT_ROUTES } from '../lib/routing.mjs';

export const GET: APIRoute = () => {
  const body = `User-agent: *
Allow: /
Sitemap: ${absoluteUrl(siteUrl, ROOT_ROUTES.sitemap)}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
