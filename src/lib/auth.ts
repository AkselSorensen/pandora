/**
 * Identité Pandora — session signée et registre d'opérateurs.
 *
 * POURQUOI CE FICHIER EXISTE
 * Jusqu'ici le sujet ABAC était lu directement dans des cookies non signés
 * (`pandora_clearance`, `pandora_role`, `pandora_compartments`). N'importe qui
 * pouvait écrire `pandora_clearance=secret` depuis la console du navigateur et
 * accéder au compartiment nucléaire : l'ABAC et le journal d'audit chaîné
 * étaient donc décoratifs. Ici, le niveau de diffusion n'est plus une valeur
 * que le client déclare — c'est un attribut d'une session *signée par le
 * serveur* au moment du login.
 *
 * Rien n'est inventé : les opérateurs viennent de `PANDORA_OPERATORS`, et sans
 * `PANDORA_SESSION_SECRET` valide le login est refusé (fail closed) plutôt que
 * de reposer sur un secret par défaut.
 *
 * Web Crypto uniquement (`crypto.subtle`) : ce code tourne aussi dans le
 * middleware, qui est un runtime Edge et n'a pas `node:crypto`.
 */

import { CLASSIFICATION_RANK, type Classification } from './classification';
import { ROLES, type Role } from './abac';

export const SESSION_COOKIE = 'pandora_session';
/**
 * Cookies de profil hérités de l'ère « non authentifiante ». Ils ne sont plus
 * lus pour autoriser quoi que ce soit, mais ils traînent encore dans les
 * navigateurs : on les purge à la connexion et à la déconnexion pour ne pas
 * laisser croire qu'ils portent encore une identité.
 */
export const LEGACY_PROFILE_COOKIES = [
  'pandora_operator',
  'pandora_role',
  'pandora_clearance',
  'pandora_compartments',
  'pandora_no_export',
] as const;
/** Durée de vie d'une session. Au-delà, il faut se reconnecter. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/** Longueur minimale du secret de signature. En dessous, on considère qu'il n'y en a pas. */
const MIN_SECRET_LENGTH = 32;
const PBKDF2_ITERATIONS = 120_000;

// ── Secret de signature ───────────────────────────────────────────────────────

export function sessionSecret(): string {
  return process.env.PANDORA_SESSION_SECRET || '';
}

/**
 * Un secret absent ou trop court vaut « non configuré » : mieux vaut refuser
 * toutes les connexions que signer avec une valeur devinable.
 */
export function sessionConfigured(): boolean {
  return sessionSecret().length >= MIN_SECRET_LENGTH;
}

// ── Encodage / HMAC ───────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

/** Comparaison à temps constant : une comparaison naïve fuit la longueur du préfixe correct. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ── Session ───────────────────────────────────────────────────────────────────

export interface SessionPayload {
  /** Opérateur authentifié. */
  sub: string;
  role: Role;
  /** Clearance réellement accordée par le registre, jamais déclarée par le client. */
  clr: Classification;
  cmp: string[];
  iat: number;
  exp: number;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(sessionSecret()), encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

/**
 * Vérifie signature **et** expiration. Toute anomalie renvoie `null` : l'appelant
 * retombe alors sur le sujet anonyme, jamais sur les cookies de profil.
 */
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token || !sessionConfigured()) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  let expected: Uint8Array;
  let given: Uint8Array;
  try {
    expected = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(sessionSecret()), encoder.encode(body)));
    given = fromBase64Url(provided);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(body))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    if (!ROLES.includes(payload.role)) return null;
    if (!(payload.clr in CLASSIFICATION_RANK)) return null;
    if (!Array.isArray(payload.cmp)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Options du cookie de session — HttpOnly : le script de page ne peut plus le lire ni le forger. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

// ── Registre d'opérateurs ─────────────────────────────────────────────────────

export interface Operator {
  id: string;
  role: Role;
  clearance: Classification;
  compartments: string[];
  /** Empreinte PBKDF2 au format `pbkdf2$iterations$salt$hash` (base64url). */
  password: string;
}

/**
 * Lit `PANDORA_OPERATORS` : un JSON `{"<id>": {"role":…, "clearance":…,
 * "compartments":[…], "password":"pbkdf2$…"}}`. Une entrée malformée est
 * ignorée — on ne devine jamais un rôle ni une clearance.
 */
export function loadOperators(): Map<string, Operator> {
  const raw = process.env.PANDORA_OPERATORS || '';
  const out = new Map<string, Operator>();
  if (!raw.trim()) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== 'object') return out;

  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const role = entry.role;
    const clearance = entry.clearance;
    const password = entry.password;
    if (typeof role !== 'string' || !ROLES.includes(role as Role)) continue;
    if (typeof clearance !== 'string' || !(clearance in CLASSIFICATION_RANK)) continue;
    if (typeof password !== 'string' || !password.startsWith('pbkdf2$')) continue;
    const compartments = Array.isArray(entry.compartments)
      ? entry.compartments.filter((c): c is string => typeof c === 'string')
      : [];
    out.set(id, {
      id,
      role: role as Role,
      clearance: clearance as Classification,
      compartments,
      password,
    });
  }
  return out;
}

// ── Mots de passe ─────────────────────────────────────────────────────────────

/** Empreinte PBKDF2-SHA256 salée. `PANDORA_HASH=<mot de passe>` pour en produire une. */
export async function hashPassword(password: string, salt?: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const useSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    // `as BufferSource` : un Uint8Array EST un BufferSource ; le générique
    // Uint8Array<ArrayBufferLike> de TS 5.7 ne le laisse pas voir.
    { name: 'PBKDF2', salt: useSalt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return `pbkdf2$${iterations}$${toBase64Url(useSalt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64Url(parts[2]);
    expected = fromBase64Url(parts[3]);
  } catch {
    return false;
  }
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, material, 256),
  );
  return timingSafeEqual(bits, expected);
}

/**
 * Authentifie un opérateur. Renvoie toujours en temps comparable pour ne pas
 * révéler si l'identifiant existe : un id inconnu est comparé à une empreinte
 * factice.
 */
const DUMMY_HASH = `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(new Uint8Array(16))}$${toBase64Url(new Uint8Array(32))}`;

export async function authenticate(id: string, password: string): Promise<Operator | null> {
  const operators = loadOperators();
  const operator = operators.get(id);
  const ok = await verifyPassword(operator ? operator.password : DUMMY_HASH, password);
  return operator && ok ? operator : null;
}
