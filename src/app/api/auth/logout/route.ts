import { NextResponse } from 'next/server';
import { SESSION_COOKIE, LEGACY_PROFILE_COOKIES } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Déconnexion : purge la session signée et les cookies de profil hérités. */
export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  for (const name of LEGACY_PROFILE_COOKIES) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  return response;
}
