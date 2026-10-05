import { NextRequest, NextResponse } from 'next/server';
import { verifySession, sessionConfigured, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Qui suis-je ? Renvoie le sujet **vérifié** (signature + expiration) ou
 * `authenticated: false`.
 *
 * Sert à l'interface pour afficher une identité réelle au lieu du sélecteur de
 * profil : le client ne peut plus se déclarer `secret`.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
        configured: sessionConfigured(),
        // Rappel explicite : sans secret, il ne peut y avoir d'authentification.
        ...(sessionConfigured() ? {} : { reason: 'session_secret_absent' }),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      operator: { id: session.sub, role: session.role, clearance: session.clr, compartments: session.cmp },
      issuedAt: new Date(session.iat).toISOString(),
      expiresAt: new Date(session.exp).toISOString(),
      ttlSeconds: Math.floor(SESSION_TTL_MS / 1000),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
