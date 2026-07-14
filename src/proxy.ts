import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * PANDORA — API Proxy / Rate Limiter
 * Replaces the deprecated middleware.ts convention (Next.js 16.2+).
 *
 * Applies rate limiting to all /api/* routes to prevent abuse.
 * In production (Vercel), consider using Vercel KV or a dedicated
 * rate-limiting solution for distributed rate limiting across isolates.
 */

// In-memory store for rate limiting (per-isolate; not distributed)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;

export function proxy(request: NextRequest) {
  // Only apply to API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // request.ip is populated securely by the hosting platform (Vercel).
  // Fallback to the leftmost x-forwarded-for if running locally/custom node server.
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = (request as any).ip || (forwarded ? forwarded.split(',')[0].trim() : 'unknown');
  const now = Date.now();

  let limitData = rateLimitMap.get(ip);

  // Clean up expired entry
  if (limitData && now > limitData.resetTime) {
    limitData = undefined;
  }

  if (!limitData) {
    limitData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, limitData);
  } else {
    limitData.count++;
  }

  // Periodic cleanup of the Map to prevent memory leaks in long-running isolates
  if (Math.random() < 0.01) { // 1% chance to run cleanup on request
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

  const response = NextResponse.next();

  // Attach rate limit headers
  response.headers.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS_PER_WINDOW - limitData.count).toString());
  response.headers.set('X-RateLimit-Reset', limitData.resetTime.toString());

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
