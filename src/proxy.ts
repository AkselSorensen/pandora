import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveResource } from '@/lib/classification';
import { authorize, buildSubject, governanceConfigured, governanceUrl } from '@/lib/abac';

/**
 * PANDORA — API Proxy: ABAC enforcement + rate limiter
 * Replaces the deprecated middleware.ts convention (Next.js 16.2+).
 *
 * Order of controls:
 *   1. classification resolution (public routes: no network call, no friction)
 *   2. ABAC decision from pandora-governance (allow/deny, journalised server-side)
 *   3. per-IP rate limiting
 *
 * Fail closed: a classified resource is served only on an explicit allow decision.
 * The operator profile is LOCAL and NOT authenticating — see docs/PHASE1.md.
 */

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // ── 1. Classification ────────────────────────────────────────────────────────
  const resource = resolveResource(pathname);
  let subjectHeader: string | null = null;
  let governanceStatus = governanceConfigured() ? 'enforced' : 'unconfigured';

  // ── 2. ABAC (skipped for public resources: most feeds stay friction-free) ────
  if (resource.classification !== 'public') {
    const subject = await buildSubject(request);
    const decision = await authorize(subject, 'read', resource);
    subjectHeader = JSON.stringify({
      ...subject,
      attestation: subject.attestation || 'server-ephemeral',
    });

    if (!decision.allow) {
      const failClosed = decision.reason === 'governance_unavailable';
      const error = decision.status === 503 ? 'governance_unavailable' : failClosed ? 'fail_closed' : 'abac_denied';
      governanceStatus = failClosed ? 'unavailable' : 'enforced';
      return NextResponse.json(
        {
          error,
          reason: decision.reason,
          classification: resource.classification,
          compartments: resource.compartments ?? [],
          path: resource.path,
          governanceUrl: governanceUrl() || null,
          hint:
            error === 'abac_denied'
              ? 'Adjust the operator profile (clearance/compartments) or use a role with enough rights.'
              : 'No journal, no access: the governance service must answer before a classified resource is served.',
        },
        { status: decision.status },
      );
    }
    governanceStatus = decision.degraded === 'governance_unconfigured' ? 'unconfigured' : 'enforced';
  }

  // ── 3. Rate limiting (per-isolate; not distributed) ─────────────────────────
  // request.ip is populated securely by the hosting platform (Vercel).
  // Fallback to the leftmost x-forwarded-for if running locally/custom node server.
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = (request as { ip?: string }).ip || (forwarded ? forwarded.split(',')[0].trim() : 'unknown');
  const now = Date.now();

  let limitData = rateLimitMap.get(ip);

  if (limitData && now > limitData.resetTime) {
    limitData = undefined;
  }

  if (!limitData) {
    limitData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, limitData);
  } else {
    limitData.count++;
  }

  if (Math.random() < 0.01) {
    // 1% chance to run cleanup on request (long-running isolates)
    for (const [key, value] of Array.from(rateLimitMap.entries())) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }

  if (limitData.count > MAX_REQUESTS_PER_WINDOW) {
    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((limitData.resetTime - now) / 1000)} seconds.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((limitData.resetTime - now) / 1000).toString(),
        },
      }
    );
  }

  // Forward the subject and the governance status to the route handlers / services.
  const requestHeaders = new Headers(request.headers);
  if (subjectHeader) requestHeaders.set('x-pandora-subject', subjectHeader);
  requestHeaders.set('x-pandora-governance', governanceStatus);
  requestHeaders.set('x-pandora-classification', resource.classification);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS_PER_WINDOW - limitData.count).toString());
  response.headers.set('X-RateLimit-Reset', limitData.resetTime.toString());
  response.headers.set('X-Pandora-Classification', resource.classification);
  response.headers.set('X-Pandora-Governance', governanceStatus);

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
