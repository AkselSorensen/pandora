import { NextRequest, NextResponse } from 'next/server';
import {
  authenticate,
  signSession,
  sessionConfigured,
  sessionCookieOptions,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  LEGACY_PROFILE_COOKIES,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * Connexion. C'est le seul endroit où un niveau de diffusion est attribué : il
 * vient du registre d'opérateurs, jamais de ce que le client envoie.
 *
 * Sans `PANDORA_SESSION_SECRET`, la route refuse (503) au lieu de signer avec
 * une valeur par défaut.
 */
export async function POST(req: NextRequest) {
  if (!sessionConfigured()) {
    return NextResponse.json(
      {
        error: 'auth_unconfigured',
        hint: 'Définir PANDORA_SESSION_SECRET (32 caractères minimum) et PANDORA_OPERATORS.',
      },
      { status: 503, headers: NO_STORE },
    );
  }

  let body: { id?: unknown; password?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!id || !password) {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 400, headers: NO_STORE });
  }

  const operator = await authenticate(id, password);
  if (!operator) {
    // `authenticate` compare toujours à une empreinte (réelle ou factice) : le
    // temps de réponse ne dit pas si l'identifiant existe.
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401, headers: NO_STORE });
  }

  const now = Date.now();
  const token = await signSession({
    sub: operator.id,
    role: operator.role,
    clr: operator.clearance,
    cmp: operator.compartments,
    iat: now,
    exp: now + SESSION_TTL_MS,
  });

  const response = NextResponse.json(
    {
      ok: true,
      operator: {
        id: operator.id,
        role: operator.role,
        clearance: operator.clearance,
        compartments: operator.compartments,
      },
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    },
    { status: 200, headers: NO_STORE },
  );
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(Math.floor(SESSION_TTL_MS / 1000)));
  // Purge des cookies de profil hérités : ils ne doivent plus pouvoir coexister
  // avec une session signée et brouiller la lecture.
  for (const name of LEGACY_PROFILE_COOKIES) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  return response;
}
