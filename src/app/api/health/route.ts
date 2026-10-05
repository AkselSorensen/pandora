import { NextResponse } from 'next/server';
import { SERVICES, serviceUrl, type ServiceDefinition } from '@/lib/service-registry';

export const dynamic = 'force-dynamic';

/** Un service qui ne répond pas en 2,5 s est considéré indisponible. */
const PROBE_TIMEOUT_MS = 2500;

type ServiceState = 'up' | 'down' | 'unconfigured';

interface ServiceHealth {
  id: string;
  label: string;
  domain: string;
  envVar: string;
  state: ServiceState;
  /** Renseigné seulement si l'URL est configurée — aucune valeur inventée sinon. */
  target?: string;
  latencyMs?: number;
  httpStatus?: number;
  error?: string;
}

/**
 * Interroge un service pour de vrai.
 *
 * Le `/api/health` précédent renvoyait `status: 'operational'` en dur, sans
 * jamais rien vérifier : l'interface pouvait afficher un statut vert pendant
 * que tous les microservices étaient éteints. Ici rien n'est présumé —
 * un service non configuré est `unconfigured`, pas `up`.
 */
async function probeService(service: ServiceDefinition): Promise<ServiceHealth> {
  const base: string = serviceUrl(service);
  const common = { id: service.id, label: service.label, domain: service.domain, envVar: service.envVar };

  if (!base) {
    return { ...common, state: 'unconfigured' };
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(`${base}${service.healthPath}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - startedAt;
    // Le corps n'est pas relayé : on ne renvoie que ce qui décrit la santé.
    return {
      ...common,
      target: base,
      state: res.ok ? 'up' : 'down',
      httpStatus: res.status,
      latencyMs,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || /timeout/i.test(message));
    return {
      ...common,
      target: base,
      state: 'down',
      latencyMs,
      error: timedOut ? `Délai dépassé (${PROBE_TIMEOUT_MS} ms)` : 'Injoignable',
    };
  }
}

/**
 * État réel de la plateforme.
 *
 * `operational` n'est renvoyé que si **tous** les services configurés répondent.
 * Un déploiement front seul (aucune variable `PANDORA_*_URL`) est rapporté
 * `unconfigured` : un état honnête, pas une panne.
 */
export async function GET() {
  const results = await Promise.all(SERVICES.map(probeService));

  const configured = results.filter((r) => r.state !== 'unconfigured');
  const up = results.filter((r) => r.state === 'up');
  const down = results.filter((r) => r.state === 'down');

  let status: 'operational' | 'degraded' | 'down' | 'unconfigured';
  if (configured.length === 0) status = 'unconfigured';
  else if (down.length === 0) status = 'operational';
  else if (up.length === 0) status = 'down';
  else status = 'degraded';

  const slowest = up.reduce<ServiceHealth | null>(
    (worst, current) =>
      current.latencyMs != null && (!worst || current.latencyMs > (worst.latencyMs ?? 0)) ? current : worst,
    null,
  );

  return NextResponse.json(
    {
      status,
      platform: 'PANDORA',
      version: '1.0.0',
      uptime: process.uptime ? Math.round(process.uptime()) : 0,
      probedAt: new Date().toISOString(),
      serviceTimeoutMs: PROBE_TIMEOUT_MS,
      counts: {
        total: results.length,
        configured: configured.length,
        up: up.length,
        down: down.length,
        unconfigured: results.length - configured.length,
      },
      slowestService: slowest ? { id: slowest.id, label: slowest.label, latencyMs: slowest.latencyMs } : null,
      services: results,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
