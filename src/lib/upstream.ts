import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Shared helpers for the Next → FastAPI proxies.
 *
 * Every classified call forwards the subject decided/verified by src/proxy.ts so the backend
 * services can apply the same ABAC rules (and, for the ontology service, filter the data
 * itself by clearance).
 */

export function serviceBase(envVar: string): string {
  return (process.env[envVar] || '').replace(/\/$/, '');
}

export function serviceMissing(service: string, envVar: string): NextResponse {
  return NextResponse.json(
    { error: 'service_unconfigured', service, envVar, hint: `Set ${envVar} to reach the backend service.` },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function subjectHeaders(req: NextRequest, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': 'pandora-web/1.0', ...extra };
  const subject = req.headers.get('x-pandora-subject');
  if (subject) headers['X-Pandora-Subject'] = subject;
  return headers;
}

/** Relay a call to a backend service, preserving its status code and body. */
export async function relay(
  req: NextRequest,
  base: string,
  path: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: subjectHeaders(req, (init.headers as Record<string, string>) || {}),
      cache: 'no-store',
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    if (typeof body === 'string' || path.includes('/export')) {
      return new NextResponse(text, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('content-type') || 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          ...(response.headers.get('content-disposition')
            ? { 'Content-Disposition': response.headers.get('content-disposition') as string }
            : {}),
        },
      });
    }
    return NextResponse.json(body, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: 'service_unreachable', target: `${base}${path}`, detail: error instanceof Error ? error.message : String(error) },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
