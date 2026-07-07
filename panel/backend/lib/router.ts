/**
 * Minimal HTTP router over `node:http` — no framework dependency. Matches
 * method + path patterns with `:param` segments, parses JSON request bodies,
 * and serializes handler results as JSON. Handlers return `{ status, body }`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RequestContext {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export interface HttpResult {
  status: number;
  body?: unknown;
}

export type Handler = (ctx: RequestContext) => Promise<HttpResult> | HttpResult;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

function matchPath(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const seg = pattern[i];
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(actual[i]);
    else if (seg !== actual[i]) return null;
  }
  return params;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError('Invalid JSON body.');
  }
}

export class BadRequestError extends Error {}

export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({ method, segments: pattern.split('/').filter(Boolean), handler });
  }
  get(p: string, h: Handler): void {
    this.add('GET', p, h);
  }
  post(p: string, h: Handler): void {
    this.add('POST', p, h);
  }
  put(p: string, h: Handler): void {
    this.add('PUT', p, h);
  }
  delete(p: string, h: Handler): void {
    this.add('DELETE', p, h);
  }

  async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const actual = url.pathname.split('/').filter(Boolean);

    try {
      for (const route of this.routes) {
        if (route.method !== req.method) continue;
        const params = matchPath(route.segments, actual);
        if (!params) continue;

        const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await readJsonBody(req);
        const result = await route.handler({ params, query: url.searchParams, body });
        return send(res, result.status, result.body);
      }
      return send(res, 404, { error: 'Not found' });
    } catch (error) {
      if (error instanceof BadRequestError) return send(res, 400, { error: error.message });
      return send(res, 500, { error: error instanceof Error ? error.message : 'Internal error' });
    }
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body ?? null));
}
