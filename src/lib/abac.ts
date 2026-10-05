/**
 * ABAC client for the governance service — used by src/proxy.ts.
 *
 * Fail closed: when the governance service is configured but unreachable, classified
 * resources are refused (503 for confidentiel/secret, 403 for diffusion restreinte).
 * When PANDORA_GOVERNANCE_URL is not configured at all, enforcement is skipped and the
 * response carries X-Pandora-Governance: unconfigured — the /sovereignty page reports it.
 *
 * The operator profile is LOCAL and NOT authenticating: it is a profile selector that makes
 * the access-control framework demonstrable, not an identity provider. Never present it as
 * authentication.
 */
import type { NextRequest } from 'next/server';
import { CLASSIFICATION_RANK, type Classification, type ResolvedResource } from './classification';
import { verifySession, SESSION_COOKIE } from './auth';

export const ROLES = ['observer', 'auditor', 'analyst', 'lead'] as const;
export type Role = (typeof ROLES)[number];

export const KNOWN_COMPARTMENTS = ['investigation', 'nuclear', 'recon', 'audit'] as const;

export interface Subject {
  operator: string;
  role: Role;
  clearance: Classification;
  compartments: string[];
  attestation: string | null;
  no_export: boolean;
}

/** Default profile: enough to use the platform, NOT enough for the secret compartment. */
export const DEFAULT_SUBJECT: Subject = {
  operator: 'local.operator',
  role: 'analyst',
  clearance: 'confidentiel',
  compartments: ['investigation', 'audit'],
  attestation: null,
  no_export: false,
};

export interface Decision {
  allow: boolean;
  reason: string;
  status: number;
  obligations: string[];
  seq?: number;
  hash?: string;
  degraded?: 'governance_unavailable' | 'governance_unconfigured';
}

function isRole(value: string | undefined): value is Role {
  return !!value && (ROLES as readonly string[]).includes(value);
}

function isClearance(value: string | undefined): value is Classification {
  return !!value && value in CLASSIFICATION_RANK;
}

/**
 * Profil d'une requête SANS session valide.
 *
 * C'est le cœur du correctif : auparavant, un visiteur non connecté recevait le
 * même profil qu'un analyste (`confidentiel` + compartiments) parce qu'il était
 * lu dans des cookies que le client contrôle. Désormais l'absence de session
 * signifie « aucune habilitation » : rôle observateur, niveau public, aucun
 * compartiment, export interdit.
 */
export const ANONYMOUS_SUBJECT: Subject = {
  operator: 'anonymous',
  role: 'observer',
  clearance: 'public',
  compartments: [],
  attestation: null,
  no_export: true,
};

/**
 * Sujet ABAC — dérivé EXCLUSIVEMENT de la session signée.
 *
 * Les cookies `pandora_clearance` / `pandora_role` / `pandora_compartments` ne
 * sont plus lus ici. Les accepter revenait à laisser n'importe quel client se
 * déclarer `secret` avec le compartiment `nuclear` depuis la console du
 * navigateur, ce qui rendait l'ABAC et le journal chaîné purement décoratifs.
 * Le niveau de diffusion est un attribut que le serveur signe, pas une valeur
 * que le client annonce.
 */
export async function buildSubject(req: NextRequest): Promise<Subject> {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const attestation = req.headers.get('x-pandora-attestation') || null;

  if (!session) {
    return { ...ANONYMOUS_SUBJECT, attestation };
  }

  return {
    operator: session.sub,
    role: session.role,
    clearance: session.clr,
    compartments: session.cmp,
    attestation,
    no_export: false,
  };
}

const GOVERNANCE_URL = (process.env.PANDORA_GOVERNANCE_URL || '').replace(/\/$/, '');
const DECISION_TTL_MS = 30_000;
const DOWN_TTL_MS = 5_000;

const decisionCache = new Map<string, { decision: Decision; expires: number }>();
let governanceDownUntil = 0;

export function governanceConfigured(): boolean {
  return GOVERNANCE_URL.length > 0;
}

export function governanceUrl(): string {
  return GOVERNANCE_URL;
}

/**
 * Ask the governance service for a decision. The audit entry is written server-side for
 * every call, allow or deny.
 */
export async function authorize(
  subject: Subject,
  action: string,
  resource: ResolvedResource,
): Promise<Decision> {
  if (!GOVERNANCE_URL) {
    return { allow: true, reason: 'governance_unconfigured', status: 200, obligations: [], degraded: 'governance_unconfigured' };
  }

  const cacheKey = `${subject.operator}|${subject.role}|${subject.clearance}|${subject.compartments.join(',')}|${action}|${resource.path}`;
  const cached = decisionCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.decision;

  if (governanceDownUntil > Date.now()) {
    return failClosed(resource, 'governance_unavailable');
  }

  // Every request carries an attestation (Zero Trust). If the browser has not provided one
  // yet, the proxy issues an ephemeral server-side attestation for this request only.
  const attestation = subject.attestation || `srv-${crypto.randomUUID()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 900);
    const response = await fetch(`${GOVERNANCE_URL}/policy/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'pandora-proxy/1.0' },
      body: JSON.stringify({
        subject: { ...subject, attestation },
        action,
        resource: {
          id: resource.path,
          type: resource.type,
          classification: resource.classification,
          compartments: resource.compartments ?? [],
        },
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) return failClosed(resource, 'governance_unavailable');

    const payload = (await response.json()) as { decision?: string; reason?: string; obligations?: string[]; seq?: number; hash?: string };
    const allow = payload.decision === 'allow';
    const decision: Decision = {
      allow,
      reason: payload.reason || (allow ? 'policy_allow' : 'policy_deny'),
      status: allow ? 200 : 403,
      obligations: payload.obligations ?? [],
      seq: payload.seq,
      hash: payload.hash,
    };
    decisionCache.set(cacheKey, { decision, expires: Date.now() + DECISION_TTL_MS });
    return decision;
  } catch {
    governanceDownUntil = Date.now() + DOWN_TTL_MS;
    return failClosed(resource, 'governance_unavailable');
  }
}

/** No journal, no access. Weakly classified resources get 403, the rest 503. */
function failClosed(resource: ResolvedResource, reason: 'governance_unavailable'): Decision {
  const lowStakes = resource.classification === 'diffusion_restreinte';
  return {
    allow: false,
    reason,
    status: lowStakes ? 403 : 503,
    obligations: [],
    degraded: reason,
  };
}

export function decisionCacheSize(): number {
  return decisionCache.size;
}
